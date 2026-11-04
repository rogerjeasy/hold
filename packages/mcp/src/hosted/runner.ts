import { HOSTED_PROMPT_VERSION, hostedPrompt } from './model.ts'
import type { AssistantModel, Block, Conversation, Message, OwnShop } from './model.ts'

// One turn of the hosted assistant: the model and Hold's MCP server take turns until the model has answered or a
// ceiling is reached (AGENTS.md section 8). The assistant reaches Hold only as an MCP client, through the same tools,
// gateway and audit log as any outside assistant. Nothing here can move money.

export const HOSTED_LIMITS = { toolCalls: 8, tokens: 30_000, milliseconds: 60_000, tokensPerReply: 1_500 } as const

// What the runner needs of an MCP client; the SDK's Client has these.
export type ToolClient = {
  listTools(): Promise<{ readonly tools: readonly { readonly name: string; readonly description?: string | undefined; readonly inputSchema: Readonly<Record<string, unknown>> }[] }>
  // A result is read field by field, as an older server may answer in another shape.
  callTool(request: { readonly name: string; readonly arguments: Record<string, unknown> }): Promise<Readonly<Record<string, unknown>>>
}

export type HostedTurn = {
  readonly conversation: Conversation
  // The model's last words this turn; empty when it refused, could not be reached or ran out of room.
  readonly reply: string
  readonly toolCalls: readonly { readonly name: string; readonly ok: boolean }[]
  // A PayPal approval link, as Hold's server returned it this turn.
  readonly approvalUrl: string | null
  readonly stopped: 'done' | 'ceiling' | 'refused' | 'unavailable'
  readonly simulated: boolean
  readonly model: string
  readonly promptVersion: string
}

const textOf = (content: unknown): string => {
  const first = Array.isArray(content) ? (content as readonly unknown[])[0] : undefined
  return typeof first === 'object' && first !== null && 'text' in first && typeof first.text === 'string' ? first.text : '{}'
}

const approvalOf = (structured: unknown) => {
  const url = typeof structured === 'object' && structured !== null && 'approval_url' in structured ? structured.approval_url : undefined
  return typeof url === 'string' && /^https:\/\/|^http:\/\/localhost[:/]/.test(url) ? url : null
}

// A call that failed inside Hold's server reaches the model as a failed tool result, like a refusal, so the turn and
// the conversation survive it. It is logged by tool and error name, never with its arguments.
async function callOrFail(client: ToolClient, name: string, input: Record<string, unknown>): Promise<Readonly<Record<string, unknown>>> {
  try {
    return await client.callTool({ name, arguments: input })
  } catch (error) {
    console.warn(JSON.stringify({ event: 'hosted_tool_failed', tool: name, error: error instanceof Error ? error.name : 'unknown' }))
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'unavailable' }) }] }
  }
}

// A lookup the person asked for with a tap on the page, such as their own latest booking: one call of Hold's tools,
// made through the same client before the model's first reply and counted as one of the turn's calls. The model reads
// its result as the answer to a call of its own.
export type HostedLookup = { readonly name: string; readonly input: Record<string, unknown> }

export async function runHostedTurn(input: { readonly model: AssistantModel; readonly client: ToolClient; readonly conversation: Conversation; readonly now: () => Date; readonly today: string; readonly ownShop?: OwnShop; readonly lookup?: HostedLookup }): Promise<HostedTurn> {
  const { model, client, now } = input
  const started = now().getTime()
  const listed = await client.listTools()
  const tools = listed.tools.map((tool) => ({ name: tool.name, description: tool.description ?? '', inputSchema: tool.inputSchema }))
  const conversation: Message[] = [...input.conversation]
  const toolCalls: { name: string; ok: boolean }[] = []
  let tokens = 0
  let approvalUrl: string | null = null
  let modelName = ''
  const finish = (stopped: HostedTurn['stopped'], reply = ''): HostedTurn => ({ conversation, reply, toolCalls, approvalUrl, stopped, simulated: model.simulated, model: modelName, promptVersion: HOSTED_PROMPT_VERSION })
  const outOfRoom = () => tokens >= HOSTED_LIMITS.tokens || now().getTime() - started >= HOSTED_LIMITS.milliseconds

  if (input.lookup !== undefined) {
    const { name } = input.lookup
    const id = `hold-lookup-${String(started)}`
    const result = await callOrFail(client, name, input.lookup.input)
    const ok = result['isError'] !== true
    toolCalls.push({ name, ok })
    conversation.push({ role: 'assistant', content: [{ type: 'tool_use', id, name, input: input.lookup.input }] })
    conversation.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: textOf(result['content']), is_error: !ok }] })
  }

  for (;;) {
    if (outOfRoom()) return finish('ceiling')
    const remaining = Math.max(1, HOSTED_LIMITS.milliseconds - (now().getTime() - started))
    const answer = await model.reply({ system: hostedPrompt(input.today, input.ownShop), messages: conversation, tools, maxTokens: HOSTED_LIMITS.tokensPerReply }, AbortSignal.timeout(remaining))
    modelName = answer.model
    if (answer.kind !== 'reply') return finish(answer.kind)
    tokens += answer.tokens
    conversation.push({ role: 'assistant', content: [...answer.content] })
    const uses = answer.content.filter((block): block is Extract<Block, { type: 'tool_use' }> => block.type === 'tool_use')
    if (answer.stopReason !== 'tool_use' || uses.length === 0) {
      return finish('done', answer.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n').trim())
    }
    const results: Block[] = []
    let ceiling = false
    for (const use of uses) {
      // Every call the model started is answered, so the next turn can go on from a whole exchange.
      if (ceiling || toolCalls.length >= HOSTED_LIMITS.toolCalls || outOfRoom()) {
        ceiling = true
        results.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify({ error: 'call_limit' }), is_error: true })
        continue
      }
      const result = await callOrFail(client, use.name, use.input)
      const ok = result['isError'] !== true
      toolCalls.push({ name: use.name, ok })
      approvalUrl = (ok ? approvalOf(result['structuredContent']) : null) ?? approvalUrl
      results.push({ type: 'tool_result', tool_use_id: use.id, content: textOf(result['content']), is_error: !ok })
    }
    conversation.push({ role: 'user', content: results })
    if (ceiling || toolCalls.length >= HOSTED_LIMITS.toolCalls) return finish('ceiling')
  }
}
