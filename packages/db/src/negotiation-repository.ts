import { checkReply, checkSettlementLimits, CLAIM_TRANSITIONS, gatewayDecision, judgeMove, negotiationDeadline, openingOffer, transition } from '@hold/domain'
import type { AgentActor, GatewayDecision, NegotiationSide, PassReason, ProposedMove, RefusalReason, Table } from '@hold/domain'
import { and, count, eq, gt, isNull, like } from 'drizzle-orm'
import { replyToClaim } from './claim-reply-repository.ts'
import { reserveEvidencePack } from './evidence-repository.ts'
import { moveFingerprint } from './negotiation-fingerprint.ts'
import { escalateNegotiation } from './negotiation-ending.ts'
import { settleIfConfirmed } from './negotiation-settlement.ts'
import { NEGOTIATION_TOOLS, offerArguments } from './negotiation-tools.ts'
import type { NegotiationTool } from './negotiation-tools.ts'
import { negotiationRecords } from './negotiation-view.ts'
import type { NegotiationRecords } from './negotiation-view.ts'
import { liveShopSettlement, RENTER_ADVOCATE } from './settlement-mandate-repository.ts'
import { auditLog, authorizations, claims, holds, mandates, negotiationMoves, negotiations, outbox, rentals } from './schema/index.ts'
import type { Transaction } from './scope.ts'

export const NEGOTIATIONS_QUEUE = 'negotiations'
// Tool calls one side may make on one negotiation in a minute.
const MOVES_PER_MINUTE = 12

// A renter who contests with an advocate (extensions.md section 9.4), once their one-time code was checked: their
// contest is recorded, their mandate granted, and either a negotiation opens, when the shop has a live mandate that
// covers this claim and there is time before the deadline, or the renter's advocate writes their reply (section 9.10).
export async function openAdvocate(transaction: Transaction, input: { readonly rentalId: string; readonly highestTotalCents: number; readonly comment: string; readonly simulated: boolean }, now: Date) {
  const [claim] = await transaction.select().from(claims).where(eq(claims.rentalId, input.rentalId)).for('update')
  if (claim === undefined) return { ok: false, reason: 'not_found' } as const
  if (claim.state !== 'presented' || claim.replyDueAt === null) return { ok: false, reason: 'already_replied' } as const
  const renterLimits = checkSettlementLimits('settlement_renter', { currency: claim.currency, highestTotalCents: input.highestTotalCents, finalTap: true })
  if (!renterLimits.ok) return { ok: false, reason: 'invalid_limits' } as const
  const replied = await replyToClaim(transaction, input.rentalId, 'contest', input.comment, now, false)
  if (!replied.ok) return replied
  const [rental] = await transaction.select({ renterId: rentals.renterId }).from(rentals).where(eq(rentals.id, input.rentalId))
  const [hold] = await transaction.select({ authorizationId: holds.currentAuthorizationId }).from(holds).where(eq(holds.rentalId, input.rentalId))
  const [authorization] = hold?.authorizationId == null ? [] : await transaction.select({ validUntil: authorizations.validUntil }).from(authorizations).where(eq(authorizations.id, hold.authorizationId))
  const [renterMandate] = await transaction.insert(mandates).values({ shopId: claim.shopId, kind: 'settlement_renter', grantedByRenterId: rental?.renterId ?? null, rentalId: input.rentalId, agent: RENTER_ADVOCATE, limits: renterLimits.value, validFrom: now, validUntil: claim.replyDueAt, grantedHow: 'one_time_code', createdAt: now }).returning({ id: mandates.id })
  if (renterMandate === undefined) throw new Error('The renter’s mandate was not recorded.')
  const shopMandate = await liveShopSettlement(transaction, now)
  const shopLimits = shopMandate === undefined ? undefined : checkSettlementLimits('settlement_shop', shopMandate.limits)
  const deadline = negotiationDeadline(claim.replyDueAt, authorization?.validUntil ?? claim.replyDueAt)
  // Claims above the shop's largest go straight to the owner: the shop has no advocate for them.
  const negotiate = shopMandate !== undefined && shopLimits?.ok === true && shopLimits.value.currency === claim.currency && claim.totalCents <= shopLimits.value.largestClaimCents && deadline > now
  const [negotiation] = await transaction.insert(negotiations).values({
    shopId: claim.shopId, claimId: claim.id, rentalId: input.rentalId, kind: negotiate ? 'negotiation' : 'reply', shopMandateId: negotiate ? shopMandate.id : null, renterMandateId: renterMandate.id,
    currency: claim.currency, claimTotalCents: claim.totalCents, roundLimit: negotiate ? shopLimits.value.rounds : 1, deadline: negotiate ? deadline : claim.replyDueAt, simulated: input.simulated, openedAt: now, updatedAt: now,
  }).returning({ id: negotiations.id })
  if (negotiation === undefined) throw new Error('The negotiation was not recorded.')
  if (negotiate) {
    if (!transition(CLAIM_TRANSITIONS, 'contested', 'negotiating').ok) throw new Error('A contested claim must be able to negotiate.')
    await transaction.update(claims).set({ state: 'negotiating' }).where(eq(claims.id, claim.id))
    // The shop opens with the claim as presented: plain code, not a model.
    const records = await loadRecords(transaction, negotiation.id)
    if (records.context === undefined) throw new Error('A negotiation needs both mandates.')
    const opening = openingOffer(records.context)
    const judged = judgeMove(records.context, records.table, opening, now)
    if (judged.outcome !== 'accepted') throw new Error('The claim as presented must be a move the referee accepts.')
    await recordMove(transaction, records, opening, judged.table, { actor: 'referee', model: null, promptVersion: null }, now)
  }
  await transaction.insert(outbox).values({ shopId: claim.shopId, queue: NEGOTIATIONS_QUEUE, messageGroup: input.rentalId, payload: { negotiationId: negotiation.id }, createdAt: now })
  await reserveEvidencePack(transaction, input.rentalId, now)
  return { ok: true, negotiationId: negotiation.id, kind: negotiate ? 'negotiation' as const : 'reply' as const, rentalId: input.rentalId } as const
}

async function loadRecords(transaction: Transaction, negotiationId: string): Promise<NegotiationRecords> {
  const records = await negotiationRecords(transaction, negotiationId)
  if (records === undefined) throw new Error('The negotiation is missing.')
  return records
}

type MoveFacts = { readonly actor: string; readonly model: string | null; readonly promptVersion: string | null }

// Adds a move the referee accepted to the end of the chain and records the table it left.
async function recordMove(transaction: Transaction, records: NegotiationRecords, move: ProposedMove, table: Table, facts: MoveFacts, now: Date) {
  const { negotiation } = records
  const stored = { sequence: records.moves.length + 1, side: move.side, kind: move.kind, lines: move.kind === 'offer' ? move.lines : [], totalCents: move.kind === 'offer' ? move.lines.reduce((sum, line) => sum + line.cents, 0) : null, passReason: move.kind === 'pass' ? move.reason : null, actor: facts.actor, createdAt: now }
  const previousFingerprint = negotiation.headFingerprint
  const fingerprint = moveFingerprint(previousFingerprint, stored)
  await transaction.insert(negotiationMoves).values({ shopId: negotiation.shopId, negotiationId: negotiation.id, ...stored, model: facts.model, promptVersion: facts.promptVersion, previousFingerprint, fingerprint })
  await transaction.update(negotiations).set({ headFingerprint: fingerprint, shopRefusals: table.refusals.shop, renterRefusals: table.refusals.renter, updatedAt: now }).where(eq(negotiations.id, negotiation.id))
  return fingerprint
}

export type MoveInput = {
  readonly negotiationId: string
  // The shop's advocate is a shop agent; the renter's advocate, or a renter's own assistant, a renter agent. The side
  // an agent moves for comes from what it is, never from what it says.
  readonly actor: AgentActor
  readonly tool: NegotiationTool
  readonly arguments: unknown
  // Why a pass was made, when the runner passes for an advocate that could not move.
  readonly passReason?: PassReason
  readonly model: string | null
  readonly promptVersion: string | null
}
export type MoveResult =
  | { readonly outcome: 'accepted'; readonly state: string }
  | { readonly outcome: 'refused'; readonly reason: RefusalReason | 'not_found' }
  | { readonly outcome: 'ended'; readonly reason: string }
  | { readonly outcome: 'gateway_refused'; readonly reason: Extract<GatewayDecision, { readonly ok: false }>['reason'] }

const sideOf = (actor: AgentActor): NegotiationSide | null => actor.kind === 'shop_agent' ? 'shop' : actor.kind === 'renter_agent' ? 'renter' : null

// The person a side's agent must act for: the owner who granted the shop's mandate, or the renter who granted theirs.
async function grantorOf(transaction: Transaction, mandateId: string | undefined): Promise<string | null> {
  if (mandateId === undefined) return null
  const [row] = await transaction.select({ user: mandates.grantedByUserId, renter: mandates.grantedByRenterId }).from(mandates).where(eq(mandates.id, mandateId))
  return row?.user ?? row?.renter ?? null
}

async function audit(transaction: Transaction, negotiation: { readonly id: string; readonly shopId: string }, actor: AgentActor, action: string, detail: Readonly<Record<string, unknown>>, now: Date) {
  await transaction.insert(auditLog).values({ shopId: negotiation.shopId, actorKind: actor.kind, actorId: actor.actsFor, action, subjectKind: 'negotiation', subjectId: negotiation.id, detail, at: now })
}

// Every move from every agent, whoever runs it (Hold's advocates now, a renter's own assistant through the MCP server
// later): the one gateway, then the referee, then the record. No move carries words (negotiation-tools.ts). The seam
// for X4.9.
export async function applyNegotiationMove(transaction: Transaction, input: MoveInput, now: Date): Promise<MoveResult> {
  const [locked] = await transaction.select().from(negotiations).where(eq(negotiations.id, input.negotiationId)).for('update')
  if (locked === undefined) return { outcome: 'refused', reason: 'not_found' }
  const records = await loadRecords(transaction, locked.id)
  const side = sideOf(input.actor)
  const mandate = side === 'shop' ? records.shopMandate : side === 'renter' ? records.renterMandate : null
  const parsed = readMove(input, side ?? 'renter')
  const [calls] = await transaction.select({ count: count() }).from(auditLog).where(and(eq(auditLog.subjectId, locked.id), eq(auditLog.actorKind, input.actor.kind), like(auditLog.action, 'negotiation.%'), gt(auditLog.at, new Date(now.getTime() - 60_000))))
  const grantor = await grantorOf(transaction, mandate?.id)
  const actor = grantor === null || input.actor.actsFor === grantor ? input.actor : { ...input.actor, actsFor: '' }
  const gate = gatewayDecision({ actor, tool: { name: `negotiation_${input.tool}`, tier: 'act_under_mandate' }, subjectShopId: locked.shopId, mandate, now, callsInWindow: calls?.count ?? 0, rateLimit: MOVES_PER_MINUTE, argumentsValid: parsed !== undefined })
  if (!gate.ok || side === null || parsed === undefined) {
    const reason = gate.ok ? 'tier' : gate.reason
    await audit(transaction, locked, input.actor, 'negotiation.gateway_refused', { reason }, now)
    if (reason === 'mandate' && side !== null) await escalateNegotiation(transaction, locked.id, 'mandate_ended', now)
    return { outcome: 'gateway_refused', reason }
  }
  return locked.kind === 'reply' ? applyReply(transaction, records, input.actor, parsed, input, now) : applyToNegotiation(transaction, records, input.actor, parsed, input, now)
}

// The tool call read with its strict schema, as the move it proposes; undefined when it has the wrong shape.
function readMove(input: MoveInput, side: NegotiationSide): ProposedMove | undefined {
  if (input.tool === 'offer') {
    const offer = offerArguments.safeParse(input.arguments)
    return offer.success ? { side, kind: 'offer', lines: offer.data.lines } : undefined
  }
  if (!NEGOTIATION_TOOLS[input.tool].safeParse(input.arguments).success) return undefined
  return input.tool === 'accept' ? { side, kind: 'accept' } : { side, kind: 'pass', reason: input.passReason ?? 'chose' }
}

async function countRefusal(transaction: Transaction, records: NegotiationRecords, actor: AgentActor, table: Table, reason: RefusalReason, now: Date): Promise<MoveResult> {
  const { negotiation } = records
  await transaction.update(negotiations).set({ shopRefusals: table.refusals.shop, renterRefusals: table.refusals.renter, updatedAt: now }).where(eq(negotiations.id, negotiation.id))
  // The other side learns nothing: a renter-side refusal's reason is returned to its advocate and kept nowhere the shop
  // can read it.
  await audit(transaction, negotiation, actor, 'negotiation.refused', actor.kind === 'shop_agent' ? { reason } : {}, now)
  if (table.status === 'escalated') await escalateNegotiation(transaction, negotiation.id, 'refused_twice', now)
  return { outcome: 'refused', reason }
}

async function applyToNegotiation(transaction: Transaction, records: NegotiationRecords, actor: AgentActor, proposed: ProposedMove, input: MoveInput, now: Date): Promise<MoveResult> {
  const { negotiation, context } = records
  if (context === undefined) return { outcome: 'refused', reason: 'not_open' }
  const judged = judgeMove(context, records.table, proposed, now)
  if (judged.outcome === 'ended') {
    await audit(transaction, negotiation, actor, 'negotiation.ended', { reason: judged.reason }, now)
    await escalateNegotiation(transaction, negotiation.id, judged.reason, now)
    return { outcome: 'ended', reason: judged.reason }
  }
  if (judged.outcome === 'refused') {
    if (judged.reason === 'not_open' || judged.reason === 'not_your_turn') {
      await audit(transaction, negotiation, actor, 'negotiation.refused', { reason: judged.reason }, now)
      return { outcome: 'refused', reason: judged.reason }
    }
    return countRefusal(transaction, records, actor, judged.table, judged.reason, now)
  }
  await recordMove(transaction, records, proposed, judged.table, { actor: actorLabel(actor), model: input.model, promptVersion: input.promptVersion }, now)
  await audit(transaction, negotiation, actor, `negotiation.${proposed.kind}`, { sequence: records.moves.length + 1 }, now)
  if (judged.table.status === 'escalated') {
    await escalateNegotiation(transaction, negotiation.id, 'pass', now)
    return { outcome: 'accepted', state: 'escalated' }
  }
  if (judged.table.status === 'agreed' && judged.table.agreed !== null) {
    await transaction.update(negotiations).set({ state: 'agreed', agreed: judged.table.agreed, updatedAt: now }).where(eq(negotiations.id, negotiation.id))
    await transaction.update(claims).set({ state: 'agreed' }).where(and(eq(claims.id, negotiation.claimId), eq(claims.state, 'negotiating')))
    await reserveEvidencePack(transaction, negotiation.rentalId, now)
    // With nothing to charge the owner waives it; where both mandates waive the final tap it settles at once.
    if (judged.table.agreed.totalCents === 0) await escalateNegotiation(transaction, negotiation.id, 'nothing_to_charge', now)
    else await settleIfConfirmed(transaction, negotiation.id, now)
    const [after] = await transaction.select({ state: negotiations.state }).from(negotiations).where(eq(negotiations.id, negotiation.id))
    return { outcome: 'accepted', state: after?.state ?? 'agreed' }
  }
  return { outcome: 'accepted', state: 'open' }
}

const actorLabel = (actor: AgentActor) => actor.kind === 'shop_agent' ? 'shop_advocate' : 'renter_advocate'

// When only the renter has an advocate, its one offer is the renter's contest: lines, grounds and evidence, inside the
// renter's highest total. The claim stays contested and the owner decides as in the spine.
async function applyReply(transaction: Transaction, records: NegotiationRecords, actor: AgentActor, proposed: ProposedMove, input: MoveInput, now: Date): Promise<MoveResult> {
  const { negotiation } = records
  if (negotiation.state !== 'open') return { outcome: 'refused', reason: 'not_open' }
  if (proposed.side !== 'renter') return { outcome: 'refused', reason: 'not_your_turn' }
  if (proposed.kind === 'pass') {
    await audit(transaction, negotiation, actor, 'negotiation.pass', {}, now)
    await escalateNegotiation(transaction, negotiation.id, 'pass', now)
    return { outcome: 'accepted', state: 'escalated' }
  }
  const checked = proposed.kind === 'accept' ? 'nothing_to_accept' as const : checkReply({ currency: negotiation.currency, lines: records.lines, claim: { renterPhotoIds: records.renterPhotoIds, goodwillAllowed: false }, renter: records.renterMandate }, proposed.lines, now)
  if (typeof checked === 'string') {
    const refusals = { shop: 0, renter: negotiation.renterRefusals + 1 }
    return countRefusal(transaction, records, actor, { ...records.table, refusals, status: refusals.renter >= 2 ? 'escalated' : 'open' }, checked, now)
  }
  await recordMove(transaction, records, proposed, records.table, { actor: actorLabel(actor), model: input.model, promptVersion: input.promptVersion }, now)
  await transaction.update(negotiations).set({ state: 'replied', endedAt: now, updatedAt: now }).where(eq(negotiations.id, negotiation.id))
  await audit(transaction, negotiation, actor, 'negotiation.offer', { sequence: 1 }, now)
  await reserveEvidencePack(transaction, negotiation.rentalId, now)
  return { outcome: 'accepted', state: 'replied' }
}

// The renter stops their advocate (extensions.md section 3, rule 7). Its mandate is revoked and a negotiation still
// running or awaiting confirmation goes to the owner. Nothing is captured.
export async function stopRenterAdvocate(transaction: Transaction, rentalId: string, now: Date) {
  const [claim] = await transaction.select({ id: claims.id }).from(claims).where(eq(claims.rentalId, rentalId))
  const [negotiation] = claim === undefined ? [] : await transaction.select().from(negotiations).where(eq(negotiations.claimId, claim.id)).for('update')
  if (negotiation === undefined) return { ok: false, reason: 'not_found' } as const
  await transaction.update(mandates).set({ revokedAt: now }).where(and(eq(mandates.id, negotiation.renterMandateId), isNull(mandates.revokedAt)))
  if (negotiation.state === 'open' || negotiation.state === 'agreed') await escalateNegotiation(transaction, negotiation.id, 'mandate_ended', now)
  return { ok: true } as const
}
