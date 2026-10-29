import { z } from 'zod'

// One turn of the insights agent (extensions.md section 12.5). AG Studio runs its agent loop in the browser and asks
// for one model turn at a time; Hold's server reads that turn into Claude's Messages API and reads Claude's reply back
// into what Studio's loop expects. Plain functions: the model call and the gate are elsewhere.

const text = z.object({ type: z.literal('text'), text: z.string().max(200_000) })
// Studio's items carry fields of their own, such as their status; only these are read.
const item = z.discriminatedUnion('type', [
  z.object({ type: z.literal('message'), role: z.enum(['user', 'system', 'assistant']), content: z.array(z.union([text, z.object({ type: z.literal('refusal'), refusal: z.string() }), z.object({ type: z.string() })])).max(100) }),
  z.object({ type: z.literal('function_call'), callId: z.string().min(1).max(200), name: z.string().min(1).max(100), arguments: z.string().max(200_000) }),
  z.object({ type: z.literal('function_call_output'), callId: z.string().min(1).max(200), output: z.string().max(400_000) }),
  // Studio keeps no signature with its reasoning items, so they cannot be sent back; they are left out.
  z.object({ type: z.literal('reasoning') }),
])
const tool = z.object({ name: z.string().min(1).max(100), description: z.string().max(20_000).optional(), parameters: z.record(z.string(), z.unknown()), kind: z.string().optional() })

// The most a turn may hold, written out: some five times the largest AG Studio sent live, about 100,000 tokens.
export const INSIGHTS_TURN_CHARACTERS = 400_000

// The turn as the browser sends it. Anything else at the top is refused, and so is a turn larger than Studio sends.
export const studioTurnSchema = z
  .strictObject({
    input: z.array(item).max(500),
    instructions: z.string().max(100_000).optional(),
    tools: z.array(tool).max(60).optional(),
    toolChoice: z.union([z.enum(['auto', 'none', 'required']), z.object({ name: z.string().min(1).max(100) })]).optional(),
  })
  .refine((turn) => JSON.stringify(turn).length <= INSIGHTS_TURN_CHARACTERS, { message: 'The turn is larger than AG Studio sends.' })
export type StudioTurn = z.infer<typeof studioTurnSchema>

export type InsightsBlock =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'tool_use'; readonly id: string; readonly name: string; readonly input: Record<string, unknown> }
  | { readonly type: 'tool_result'; readonly tool_use_id: string; readonly content: string }
export type InsightsMessage = { readonly role: 'user' | 'assistant'; readonly content: InsightsBlock[] }
export type InsightsToolChoice = { readonly type: 'auto' } | { readonly type: 'none' } | { readonly type: 'any' } | { readonly type: 'tool'; readonly name: string }
export type InsightsRequest = {
  readonly system: string
  readonly messages: readonly InsightsMessage[]
  readonly tools: readonly { readonly name: string; readonly description: string; readonly inputSchema: Record<string, unknown> }[]
  readonly toolChoice: InsightsToolChoice
}

const argumentsSchema = z.record(z.string(), z.unknown())

function toolChoice(choice: StudioTurn['toolChoice']): InsightsToolChoice {
  if (choice === undefined || choice === 'auto') return { type: 'auto' }
  if (choice === 'none') return { type: 'none' }
  if (choice === 'required') return { type: 'any' }
  return { type: 'tool', name: choice.name }
}

// Opus 4.6 takes no prefill, so a conversation Studio ends on the agent's own words gets this from Hold after them.
const CARRY_ON = 'Carry on with the task from where you left off.'

// Hold's own instructions come first, then Studio's for this agent, then what Studio says about the dashboard.
export function insightsRequest(turn: StudioTurn, holdInstructions: string): InsightsRequest {
  const system = [holdInstructions, turn.instructions ?? '']
  const messages: InsightsMessage[] = []
  // Claude's turns alternate, and one turn's tool results go back together, so blocks join the turn before them.
  const add = (role: InsightsMessage['role'], block: InsightsBlock) => {
    const last = messages.at(-1)
    if (last?.role === role) last.content.push(block)
    else messages.push({ role, content: [block] })
  }
  for (const each of turn.input) {
    if (each.type === 'message') {
      const texts = each.content.flatMap((part) => ('text' in part ? [part.text] : []))
      if (each.role === 'system') system.push(...texts)
      else for (const value of texts) add(each.role, { type: 'text', text: value })
    } else if (each.type === 'function_call') {
      add('assistant', { type: 'tool_use', id: each.callId, name: each.name, input: argumentsSchema.parse(JSON.parse(each.arguments)) })
    } else if (each.type === 'function_call_output') {
      add('user', { type: 'tool_result', tool_use_id: each.callId, content: each.output })
    }
  }
  if (messages.at(-1)?.role === 'assistant') add('user', { type: 'text', text: CARRY_ON })
  return {
    system: system.filter((part) => part !== '').join('\n\n'),
    messages,
    tools: (turn.tools ?? []).filter((each) => each.kind !== 'provided').map((each) => ({ name: each.name, description: each.description ?? '', inputSchema: each.parameters })),
    toolChoice: toolChoice(turn.toolChoice),
  }
}

export type InsightsReply = {
  readonly id: string
  readonly model: string
  readonly stopReason: string
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number }
  readonly content: readonly (Extract<InsightsBlock, { type: 'text' | 'tool_use' }>)[]
}

// What Studio's loop reads back: its own output items, so its next turn's history is built from them.
export type InsightsOutputItem =
  | { id: string; kind: 'output'; type: 'message'; role: 'assistant'; status: 'completed'; content: ({ type: 'text'; text: string; annotations: [] } | { type: 'refusal'; refusal: string })[] }
  | { id: string; kind: 'output'; type: 'function_call'; callId: string; name: string; arguments: string; status: 'completed' }
export type InsightsResponse = {
  id: string
  createdAt: number
  status: 'completed' | 'incomplete' | 'failed'
  incompleteDetails?: { reason: 'max_output_tokens' }
  error?: { code: string; message: string }
  model: string
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
  output: InsightsOutputItem[]
}

// What Studio's loop reads: the text, then each call the gate kept, in order. Studio runs the calls and builds the
// next turn's history from this, so a call the gate dropped never happened as far as the agent is concerned.
export function insightsResponse(reply: InsightsReply, keptCallIds: readonly string[], now: Date): InsightsResponse {
  const output = reply.content.flatMap((block, index): InsightsOutputItem[] => {
    if (block.type === 'text') return [{ id: `${reply.id}-${String(index)}`, kind: 'output', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'text', text: block.text, annotations: [] }] }]
    return keptCallIds.includes(block.id) ? [{ id: block.id, kind: 'output', type: 'function_call', callId: block.id, name: block.name, arguments: JSON.stringify(block.input), status: 'completed' }] : []
  })
  const refusal: InsightsOutputItem[] = reply.stopReason === 'refusal' ? [{ id: `${reply.id}-refusal`, kind: 'output', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'refusal', refusal: 'The model declined to answer.' }] }] : []
  const truncated = reply.stopReason === 'max_tokens'
  return {
    id: reply.id,
    createdAt: now.getTime(),
    status: truncated ? 'incomplete' : 'completed',
    ...(truncated ? { incompleteDetails: { reason: 'max_output_tokens' as const } } : {}),
    model: reply.model,
    usage: { inputTokens: reply.usage.inputTokens, outputTokens: reply.usage.outputTokens, totalTokens: reply.usage.inputTokens + reply.usage.outputTokens },
    output: [...output, ...refusal],
  }
}
