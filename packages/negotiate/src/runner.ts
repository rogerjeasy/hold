import { applyNegotiationMove, escalateNegotiation, inShop, isHoldAdvocate, negotiationEvidence, negotiationRecords, RENTER_ADVOCATE, SHOP_ADVOCATE } from '@hold/db'
import type { Database, DatabaseRole, MoveResult, NegotiationRecords, NegotiationTool } from '@hold/db'
import { negotiationEnding, SAMPLE_ADVOCATE_RUN_TOKENS } from '@hold/domain'
import type { AgentActor, NegotiationSide, PassReason } from '@hold/domain'
import { z } from 'zod'
import type { AdvocateModel } from './advocate-model.ts'
import { advocateConversation, MOVE_LIMITS } from './advocate-turn.ts'
import type { MoveLimits } from './advocate-turn.ts'
import { evidenceReader, NO_PHOTOS } from './evidence-tools.ts'
import type { PhotoReader } from './evidence-tools.ts'
import { ADVOCATE_PROMPT_VERSION, MOVE_OPENING, RENTER_ADVOCATE_PROMPT, SHOP_ADVOCATE_PROMPT } from './prompts.ts'

// Runs one negotiation as far as Hold's advocates can take it (extensions.md section 9.8), from the queue. Each move
// reads the records in a transaction of its own, lets that side's model investigate and choose outside any
// transaction, and applies the move through the gateway and the referee in another. A run picks up where the
// transcript stands, so a retried message repeats nothing. When the side to move is a renter's own assistant, the run
// stops: the assistant moves through the MCP server, which hands the shop's turn back to this queue.

// Ceilings on one run, across its moves. A side that reaches one passes, so the claim goes to the owner and nothing is
// captured. The run and one more move end inside the worker's ten minutes (infra/lib/negotiation-worker.ts).
export const RUN_LIMITS = { maxCalls: 60, maxTokens: 600_000, maxMilliseconds: 8 * 60_000, perCallMilliseconds: 60_000 } as const
// A demo's sample claim is argued on the account's shared daily Claude allowance, so its run stops much sooner.
const tokenCeiling = (records: NegotiationRecords, maxTokens: number) => (records.sample ? Math.min(maxTokens, SAMPLE_ADVOCATE_RUN_TOKENS) : maxTokens)
type RunLimits = { readonly [Key in keyof typeof RUN_LIMITS]: number }

export const negotiationMessageSchema = z.object({ shopId: z.uuid(), negotiationId: z.uuid() })
export type NegotiationMessage = z.infer<typeof negotiationMessageSchema>

export type RunDependencies = {
  readonly database: Database
  readonly role: DatabaseRole
  readonly models: Readonly<Record<NegotiationSide, AdvocateModel>>
  readonly now: () => Date
  // The display copies of the claim's photographs, as images. Without it the advocates read the records only.
  readonly photos?: PhotoReader
  readonly limits?: Partial<RunLimits>
  readonly moveLimits?: Partial<MoveLimits>
}
export type RunOutcome = { readonly state: string; readonly calls: number; readonly tokens: number; readonly waitingFor?: 'renter_assistant' }

// The agent for a side acts for the person who granted that side's mandate.
const actorFor = (records: NegotiationRecords, side: NegotiationSide): AgentActor => ({ kind: side === 'shop' ? 'shop_agent' : 'renter_agent', shopId: records.negotiation.shopId, actsFor: records.grantors[side] })
const mandateOf = (records: NegotiationRecords, side: NegotiationSide) => (side === 'shop' ? records.shopMandate : records.renterMandate)

export async function runNegotiation(dependencies: RunDependencies, message: NegotiationMessage): Promise<RunOutcome> {
  const limits = { ...RUN_LIMITS, ...dependencies.limits }
  const inTransaction = <Result>(work: Parameters<typeof inShop<Result>>[2]) => inShop(dependencies.database, { role: dependencies.role, shopId: message.shopId }, work)
  const started = dependencies.now().getTime()
  let calls = 0
  let tokens = 0
  const apply = (records: NegotiationRecords, side: NegotiationSide, tool: NegotiationTool, input: unknown, model: string | null, passReason?: PassReason): Promise<MoveResult> =>
    inTransaction((transaction) => applyNegotiationMove(transaction, { negotiationId: records.negotiation.id, actor: actorFor(records, side), agent: side === 'shop' ? SHOP_ADVOCATE : RENTER_ADVOCATE, tool, arguments: input, model, promptVersion: model === null ? null : ADVOCATE_PROMPT_VERSION, ...(passReason === undefined ? {} : { passReason }) }, dependencies.now()))

  // Every move either records a move, counts a refusal or ends the negotiation, so the loop is bounded by the referee;
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
    // Hold moves only for a side whose mandate names Hold's advocate.
    if (!isHoldAdvocate(mandateOf(records, side)?.grantedTo ?? '')) return { state: 'open', calls, tokens, waitingFor: 'renter_assistant' }
    const spentMilliseconds = dependencies.now().getTime() - started
    const maxTokens = tokenCeiling(records, limits.maxTokens)
    if (calls >= limits.maxCalls || tokens >= maxTokens || spentMilliseconds >= limits.maxMilliseconds) {
      await apply(records, side, 'pass', {}, null, 'ceiling')
      continue
    }
    const evidence = await inTransaction((transaction) => negotiationEvidence(transaction, records.negotiation.id))
    // The move's own ceilings, never more than what is left of the run's.
    const moveLimits = { ...MOVE_LIMITS, ...dependencies.moveLimits }
    const conversation = advocateConversation({
      model: dependencies.models[side],
      side,
      system: side === 'shop' ? SHOP_ADVOCATE_PROMPT : RENTER_ADVOCATE_PROMPT,
      opening: MOVE_OPENING,
      readTool: evidenceReader({ records, side, evidence, photo: dependencies.photos ?? NO_PHOTOS }),
      limits: { ...moveLimits, maxModelCalls: Math.min(moveLimits.maxModelCalls, limits.maxCalls - calls), maxTokens: Math.min(moveLimits.maxTokens, maxTokens - tokens), maxMilliseconds: Math.min(moveLimits.maxMilliseconds, limits.maxMilliseconds - spentMilliseconds) },
      now: dependencies.now,
      perCallMilliseconds: limits.perCallMilliseconds,
    })
    // A refused move gets one retry, told the referee's reason. Its second refusal is a pass, by the referee or here.
    let refusal: string | null = null
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const decision = await conversation.nextMove(refusal)
      if (decision.kind === 'pass') {
        await apply(records, side, 'pass', {}, decision.model, decision.reason)
        break
      }
      const result = await apply(records, side, decision.tool, decision.input, decision.model)
      if (result.outcome === 'accepted' || result.outcome === 'ended') break
      if (result.outcome === 'refused' && (result.reason === 'not_open' || result.reason === 'not_your_turn' || result.reason === 'not_found')) break
      refusal = result.reason
      if (attempt === 1 && result.outcome === 'gateway_refused') await apply(records, side, 'pass', {}, decision.model, 'unavailable')
    }
    calls += conversation.usage.modelCalls
    tokens += conversation.usage.tokens
  }
  const last = await inTransaction((transaction) => negotiationRecords(transaction, message.negotiationId))
  return { state: last?.negotiation.state ?? 'missing', calls, tokens }
}
