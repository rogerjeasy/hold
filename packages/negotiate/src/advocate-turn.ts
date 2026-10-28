import type { NegotiationSide } from '@hold/domain'
import type { NegotiationTool } from '@hold/db'
import { isEvidenceTool, isMoveTool } from './advocate-model.ts'
import type { AdvocateMessage, AdvocateModel, AdvocateReply, ToolCall, ToolResult } from './advocate-model.ts'

// One advocate's move as a bounded tool loop (extensions.md section 9.13): the model reads the evidence through
// read-only tools over a few turns, then calls exactly one move, which the runner hands to the gateway and the referee.
// A move the referee refuses goes back to the model in the same conversation, once. Any ceiling, refusal or failure
// is a pass, so the claim goes to the owner and nothing is charged.

// Ceilings on one move. A move that reaches the model-call, token or time ceiling is a pass; reads past their ceiling
// are not run, and the model is asked to move instead.
export const MOVE_LIMITS = { maxModelCalls: 5, maxToolCalls: 10, maxTokens: 150_000, maxMilliseconds: 3 * 60_000 } as const
export type MoveLimits = { readonly [Key in keyof typeof MOVE_LIMITS]: number }

export type MoveDecision =
  | { readonly kind: 'move'; readonly tool: NegotiationTool; readonly input: unknown; readonly model: string }
  | { readonly kind: 'pass'; readonly reason: 'unavailable' | 'ceiling'; readonly model: string | null }

type Options = {
  readonly model: AdvocateModel
  readonly side: NegotiationSide
  readonly system: string
  readonly opening: string
  readonly readTool: (call: ToolCall) => Promise<ToolResult>
  readonly limits: MoveLimits
  readonly now: () => Date
  readonly perCallMilliseconds: number
}

const note = (callId: string, text: string): ToolResult => ({ callId, parts: [{ type: 'text', text }], isError: true })
const NOT_RUN_AFTER_MOVE = 'Not run: a move ends the reading.'
const NO_MORE_READS = 'Not run: no more reads for this move. Make your move now.'

export function advocateConversation(options: Options) {
  const messages: AdvocateMessage[] = [{ role: 'user', text: options.opening }]
  const usage = { modelCalls: 0, toolCalls: 0, tokens: 0 }
  const started = options.now().getTime()
  // The results still owed for the turn that made the last move: the reads it skipped, then the referee's answer.
  let owed: { readonly move: ToolCall; readonly skipped: readonly ToolCall[] } | null = null
  let lastModel: string | null = null

  const spent = () => usage.modelCalls >= options.limits.maxModelCalls || usage.tokens >= options.limits.maxTokens || options.now().getTime() - started >= options.limits.maxMilliseconds

  async function ask(): Promise<AdvocateReply> {
    try {
      return await options.model.next({ side: options.side, system: options.system, messages }, AbortSignal.timeout(options.perCallMilliseconds))
    } catch {
      return { kind: 'unavailable', model: 'not_answered', inputTokens: 0, outputTokens: 0 }
    }
  }

  async function read(call: ToolCall): Promise<ToolResult> {
    if (isMoveTool(call.name)) return note(call.id, NOT_RUN_AFTER_MOVE)
    if (!isEvidenceTool(call.name)) return note(call.id, 'unknown_tool')
    usage.toolCalls += 1
    return usage.toolCalls > options.limits.maxToolCalls ? note(call.id, NO_MORE_READS) : options.readTool(call)
  }

  // The next move: after a refusal, the referee's reason is the model's next message.
  async function nextMove(refusal: string | null): Promise<MoveDecision> {
    if (owed !== null && refusal !== null) messages.push({ role: 'tool_results', results: [...owed.skipped.map((call) => note(call.id, NOT_RUN_AFTER_MOVE)), note(owed.move.id, `The referee refused this move. Its reason: ${refusal}. Make one move again.`)] })
    owed = null
    for (;;) {
      if (spent()) return { kind: 'pass', reason: 'ceiling', model: lastModel }
      const reply = await ask()
      usage.modelCalls += 1
      usage.tokens += reply.inputTokens + reply.outputTokens
      lastModel = reply.model
      if (reply.kind !== 'calls') return { kind: 'pass', reason: 'unavailable', model: reply.model }
      messages.push({ role: 'assistant', calls: reply.calls, raw: reply.raw })
      const moves = reply.calls.filter((call) => isMoveTool(call.name))
      const [move] = moves
      if (moves.length > 1) return { kind: 'pass', reason: 'unavailable', model: reply.model }
      if (move !== undefined && isMoveTool(move.name)) {
        owed = { move, skipped: reply.calls.filter((call) => call !== move) }
        return { kind: 'move', tool: move.name, input: move.input, model: reply.model }
      }
      const results: ToolResult[] = []
      for (const call of reply.calls) results.push(await read(call))
      messages.push({ role: 'tool_results', results })
    }
  }

  return { nextMove, usage }
}
