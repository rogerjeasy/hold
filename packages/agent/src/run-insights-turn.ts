import { gateInsightsCalls } from '@hold/domain'
import type { DroppedCall } from '@hold/domain'
import { INSIGHTS_INSTRUCTIONS, INSIGHTS_MAX_TOKENS, INSIGHTS_PROMPT_VERSION } from './insights-model.ts'
import type { InsightsModel } from './insights-model.ts'
import { insightsRequest, insightsResponse } from './insights-protocol.ts'
import type { InsightsResponse, StudioTurn } from './insights-protocol.ts'

// One turn of the insights agent through Hold's server (extensions.md section 12.5): one model call with Hold's
// instructions and a token ceiling, then the gate on every call the model asked for. Only what the gate kept goes back
// to AG Studio in the browser, which carries it out on the dashboard.

export type InsightsTurnResult = {
  readonly outcome: 'answered' | 'refused' | 'unavailable'
  readonly response: InsightsResponse
  readonly kept: readonly string[]
  readonly dropped: readonly Omit<DroppedCall, 'callId'>[]
  readonly model: string
  readonly promptVersion: string
  readonly tokens: number
  readonly simulated: boolean
  // Why the model could not be reached, when it could not.
  readonly reason?: string
}

export async function runInsightsTurn({ model, turn, now, signal }: { model: InsightsModel; turn: StudioTurn; now: Date; signal?: AbortSignal }): Promise<InsightsTurnResult> {
  const request = insightsRequest(turn, INSIGHTS_INSTRUCTIONS)
  const answer = await model.reply({ ...request, maxTokens: INSIGHTS_MAX_TOKENS }, signal)
  const common = { promptVersion: INSIGHTS_PROMPT_VERSION, simulated: model.simulated }
  if (answer.kind === 'unavailable') {
    const response: InsightsResponse = { id: 'unavailable', createdAt: now.getTime(), status: 'failed', error: { code: 'unavailable', message: 'The model could not be reached. The dashboard still shows every widget.' }, model: answer.model, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, output: [] }
    return { ...common, outcome: 'unavailable', response, kept: [], dropped: [], model: answer.model, tokens: 0, reason: answer.reason }
  }
  if (answer.kind === 'refused') {
    const response = insightsResponse({ id: 'refused', model: answer.model, stopReason: 'refusal', usage: { inputTokens: 0, outputTokens: 0 }, content: [] }, [], now)
    return { ...common, outcome: 'refused', response, kept: [], dropped: [], model: answer.model, tokens: 0 }
  }
  const calls = answer.reply.content.flatMap((block) => (block.type === 'tool_use' ? [{ callId: block.id, name: block.name }] : []))
  const gated = gateInsightsCalls(calls, request.tools.map((tool) => tool.name))
  return {
    ...common,
    outcome: 'answered',
    response: insightsResponse(answer.reply, gated.kept.map((call) => call.callId), now),
    kept: gated.kept.map((call) => call.name),
    dropped: gated.dropped.map(({ name, reason }) => ({ name, reason })),
    model: answer.reply.model,
    tokens: answer.reply.usage.inputTokens + answer.reply.usage.outputTokens,
  }
}
