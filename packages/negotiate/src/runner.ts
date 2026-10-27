import { applyNegotiationMove, escalateNegotiation, inShop, negotiationRecords } from '@hold/db'
import type { Database, DatabaseRole, MoveResult, NegotiationRecords, NegotiationTool } from '@hold/db'
import { negotiationEnding } from '@hold/domain'
import type { AgentActor, NegotiationSide, PassReason } from '@hold/domain'
import { z } from 'zod'
import type { AdvocateModel } from './advocate-model.ts'
import { briefFor, renderBrief } from './brief.ts'
import { ADVOCATE_PROMPT_VERSION, RENTER_ADVOCATE_PROMPT, SHOP_ADVOCATE_PROMPT } from './prompts.ts'

// Runs one negotiation to its end (extensions.md section 9.8), from the queue. Each turn reads the records in a
// transaction of its own, asks that side's model outside any transaction, and applies the move through the gateway and
// the referee in another. A run picks up where the transcript stands, so a retried message repeats nothing.

// Ceilings on one run. A side that reaches one passes, so the claim goes to the owner and nothing is captured.
export const RUN_LIMITS = { maxCalls: 30, maxTokens: 400_000, maxMilliseconds: 9 * 60_000, perCallMilliseconds: 60_000 } as const
type RunLimits = { readonly [Key in keyof typeof RUN_LIMITS]: number }

export const negotiationMessageSchema = z.object({ shopId: z.uuid(), negotiationId: z.uuid() })
export type NegotiationMessage = z.infer<typeof negotiationMessageSchema>

export type RunDependencies = {
  readonly database: Database
  readonly role: DatabaseRole
  readonly models: Readonly<Record<NegotiationSide, AdvocateModel>>
  readonly now: () => Date
  readonly limits?: Partial<RunLimits>
}

// The agent for a side acts for the person who granted that side's mandate.
const actorFor = (records: NegotiationRecords, side: NegotiationSide): AgentActor => ({ kind: side === 'shop' ? 'shop_agent' : 'renter_agent', shopId: records.negotiation.shopId, actsFor: records.grantors[side] })

export async function runNegotiation(dependencies: RunDependencies, message: NegotiationMessage): Promise<{ readonly state: string; readonly calls: number; readonly tokens: number }> {
  const limits = { ...RUN_LIMITS, ...dependencies.limits }
  const inTransaction = <Result>(work: Parameters<typeof inShop<Result>>[2]) => inShop(dependencies.database, { role: dependencies.role, shopId: message.shopId }, work)
  const started = dependencies.now().getTime()
  let calls = 0
  let tokens = 0
  const apply = (records: NegotiationRecords, actor: AgentActor, tool: NegotiationTool, input: unknown, model: string | null, passReason?: PassReason): Promise<MoveResult> =>
    inTransaction((transaction) => applyNegotiationMove(transaction, { negotiationId: records.negotiation.id, actor, tool, arguments: input, model, promptVersion: model === null ? null : ADVOCATE_PROMPT_VERSION, ...(passReason === undefined ? {} : { passReason }) }, dependencies.now()))

  // Every turn either records a move, counts a refusal or ends the negotiation, so the loop is bounded by the referee;
  // the count below only guards against a fault.
  for (let turn = 0; turn < 4 * 10 + 4; turn += 1) {
    const records = await inTransaction((transaction) => negotiationRecords(transaction, message.negotiationId))
    if (records?.negotiation.state !== 'open') return { state: records?.negotiation.state ?? 'missing', calls, tokens }
    const side: NegotiationSide = records.negotiation.kind === 'reply' ? 'renter' : records.table.turn
    const ending = records.context === undefined ? null : negotiationEnding(records.context, records.table, dependencies.now())
    if (ending !== null) {
      await inTransaction((transaction) => escalateNegotiation(transaction, records.negotiation.id, ending, dependencies.now()))
      continue
    }
    const actor = actorFor(records, side)
    const spent = calls >= limits.maxCalls || tokens >= limits.maxTokens || dependencies.now().getTime() - started >= limits.maxMilliseconds
    if (spent) {
      await apply(records, actor, 'pass', {}, null, 'ceiling')
      continue
    }
    const brief = briefFor(records, side)
    const system = side === 'shop' ? SHOP_ADVOCATE_PROMPT : RENTER_ADVOCATE_PROMPT
    // A refused move gets one retry, told the referee's reason. Its second refusal is a pass, by the referee or here.
    let refusal: string | null = null
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let reply
      try {
        reply = await dependencies.models[side].move({ side, system, message: renderBrief(brief, refusal) }, AbortSignal.timeout(limits.perCallMilliseconds))
      } catch {
        reply = { kind: 'unavailable' as const, model: 'not_answered', inputTokens: 0, outputTokens: 0 }
      }
      calls += 1
      tokens += reply.inputTokens + reply.outputTokens
      if (reply.kind !== 'move') {
        await apply(records, actor, 'pass', {}, reply.model, 'unavailable')
        break
      }
      const result = await apply(records, actor, reply.tool, reply.input, reply.model)
      if (result.outcome === 'accepted' || result.outcome === 'ended') break
      if (result.outcome === 'refused' && (result.reason === 'not_open' || result.reason === 'not_your_turn' || result.reason === 'not_found')) break
      refusal = result.reason
      if (attempt === 1 && result.outcome === 'gateway_refused') await apply(records, actor, 'pass', {}, reply.model, 'unavailable')
    }
  }
  const last = await inTransaction((transaction) => negotiationRecords(transaction, message.negotiationId))
  return { state: last?.negotiation.state ?? 'missing', calls, tokens }
}
