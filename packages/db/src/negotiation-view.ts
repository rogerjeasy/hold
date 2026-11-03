import { checkSettlementLimits, lineFacts, replayTable, wearClauses } from '@hold/domain'
import type { LineFacts, Mandate, ProposedMove, RefereeContext, Table } from '@hold/domain'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { verifyTranscript } from './negotiation-fingerprint.ts'
import type { ChainedMove } from './negotiation-fingerprint.ts'
import { isAssistantAdvocate, mandateFromRow } from './settlement-mandate-repository.ts'
import { captureSessions, claimLines, claimReplies, claims, comparisons, findings, mandates, marks, negotiationMoves, negotiations, priceEntries, rentalItems, rentals, wearPolicies } from './schema/index.ts'
import type { Transaction } from './scope.ts'

type MoveRow = typeof negotiationMoves.$inferSelect
export type StoredMove = ChainedMove & { readonly model: string | null; readonly promptVersion: string | null }

const asChained = (row: MoveRow): StoredMove => ({ sequence: row.sequence, side: row.side, kind: row.kind, lines: row.lines, totalCents: row.totalCents, passReason: row.passReason, actor: row.actor, createdAt: row.createdAt, previousFingerprint: row.previousFingerprint, fingerprint: row.fingerprint, model: row.model, promptVersion: row.promptVersion })

export function proposedMove(move: StoredMove): ProposedMove {
  if (move.kind === 'offer') return { side: move.side, kind: 'offer', lines: move.lines }
  return move.kind === 'accept' ? { side: move.side, kind: 'accept' } : { side: move.side, kind: 'pass', reason: move.passReason ?? 'chose' }
}

// The negotiations of the shop in scope that are still exchanging offers.
export async function openNegotiations(transaction: Transaction): Promise<readonly { readonly id: string }[]> {
  return transaction.select({ id: negotiations.id }).from(negotiations).where(eq(negotiations.state, 'open'))
}

// The marks on an item, each with whether it was seen before this rental: at its handover, or during an earlier
// rental, and not reported by this renter.
export async function itemMarks(transaction: Transaction, itemId: string, rentalId: string) {
  const rows = await transaction.select({ id: marks.id, view: marks.view, region: marks.region, description: marks.description, status: marks.status, incidentId: marks.incidentId, sessionKind: captureSessions.kind, sessionRentalId: rentalItems.rentalId })
    .from(marks).innerJoin(captureSessions, eq(captureSessions.id, marks.firstSeenSessionId)).innerJoin(rentalItems, eq(rentalItems.id, captureSessions.rentalItemId)).where(eq(marks.itemId, itemId))
  return rows.map((mark) => ({ id: mark.id, view: mark.view, region: mark.region, description: mark.description, seenBeforeRental: mark.status === 'open' && mark.incidentId === null && (mark.sessionKind === 'handover' || mark.sessionRentalId !== rentalId) }))
}

// The facts code reads for each claim line (extensions.md section 9.6): the finding, how well its photographs aligned,
// and the marks on its item that were there before this rental. A line a person added has no finding. The contest
// summary reads them too (architecture.md section 6.15).
export async function claimLineFacts(transaction: Transaction, claimId: string, rentalId: string, wearRules: string) {
  const rows = await transaction.select({ id: claimLines.id, amountCents: claimLines.amountCents, findingId: claimLines.findingId, description: priceEntries.description, reason: claimLines.reason, source: claimLines.source, addedByUserId: claimLines.addedByUserId }).from(claimLines).innerJoin(priceEntries, eq(priceEntries.id, claimLines.priceEntryId)).where(eq(claimLines.claimId, claimId)).orderBy(asc(claimLines.createdAt), asc(claimLines.id))
  return Promise.all(rows.map(async (line) => {
    const [finding] = line.findingId === null ? [] : await transaction.select({ view: findings.view, region: findings.region, confidence: findings.confidence, secondLookConfirmed: findings.secondLookConfirmed, description: findings.description, alignment: comparisons.alignment, itemId: rentalItems.itemId })
      .from(findings).innerJoin(comparisons, eq(comparisons.id, findings.comparisonId)).innerJoin(captureSessions, eq(captureSessions.id, comparisons.returnSessionId)).innerJoin(rentalItems, eq(rentalItems.id, captureSessions.rentalItemId)).where(eq(findings.id, line.findingId))
    const before = finding === undefined ? [] : await itemMarks(transaction, finding.itemId, rentalId)
    const facts = lineFacts({ lineId: line.id, publishedCents: line.amountCents, finding: finding === undefined ? null : { ...finding, alignment: finding.alignment?.[finding.view] ?? null }, marks: before, wearRules })
    return { facts, description: line.description, reason: line.reason ?? finding?.description ?? '', source: line.source, addedByUserId: line.addedByUserId, findingDescription: finding?.description ?? null }
  }))
}

// Everything about one negotiation, for the referee, the advocates' runner and the screens to take their part from.
// It holds both sides' limits: what leaves it for an advocate, a person or a page is chosen by whoever reads it.
export async function negotiationRecords(transaction: Transaction, negotiationId: string) {
  const [negotiation] = await transaction.select().from(negotiations).where(eq(negotiations.id, negotiationId))
  if (negotiation === undefined) return undefined
  const [rental] = await transaction.select({ wearPolicyId: rentals.wearPolicyId, renterId: rentals.renterId, language: rentals.language }).from(rentals).where(eq(rentals.id, negotiation.rentalId))
  const [wear] = rental === undefined ? [] : await transaction.select({ rules: wearPolicies.rules }).from(wearPolicies).where(eq(wearPolicies.id, rental.wearPolicyId))
  const wearRules = wear?.rules ?? ''
  const lines = await claimLineFacts(transaction, negotiation.claimId, negotiation.rentalId, wearRules)
  const replies = await transaction.select({ comment: claimReplies.comment, addedPhotoIds: claimReplies.addedPhotoIds }).from(claimReplies).where(eq(claimReplies.claimId, negotiation.claimId)).orderBy(asc(claimReplies.createdAt))
  const mandateRows = await transaction.select().from(mandates).where(inArray(mandates.id, [negotiation.renterMandateId, ...(negotiation.shopMandateId === null ? [] : [negotiation.shopMandateId])]))
  const mandateOf = (id: string | null): Mandate | null => { const row = mandateRows.find((each) => each.id === id); return row === undefined ? null : mandateFromRow(row) }
  const renterMandate = mandateOf(negotiation.renterMandateId)
  if (renterMandate === null) throw new Error('A negotiation’s renter mandate is missing.')
  const shopMandate = mandateOf(negotiation.shopMandateId)
  const shopLimits = shopMandate === null ? undefined : checkSettlementLimits('settlement_shop', shopMandate.limits)
  const renterPhotoIds = replies.flatMap((reply) => reply.addedPhotoIds)
  const facts: readonly LineFacts[] = lines.map((line) => line.facts)
  const context: RefereeContext | undefined = shopMandate === null || shopLimits?.ok !== true ? undefined : { currency: negotiation.currency, lines: facts, claim: { renterPhotoIds, goodwillAllowed: !shopLimits.value.evidenceRequired }, roundLimit: negotiation.roundLimit, deadline: negotiation.deadline, mandates: { shop: shopMandate, renter: renterMandate } }
  const moves = (await transaction.select().from(negotiationMoves).where(eq(negotiationMoves.negotiationId, negotiationId)).orderBy(asc(negotiationMoves.sequence))).map(asChained)
  const replayed = replayTable(negotiation.openedAt, moves.map((move) => ({ move: proposedMove(move), at: move.createdAt })), { shop: negotiation.shopRefusals, renter: negotiation.renterRefusals })
  // The record's state rules: it also ends for reasons that are not moves, such as a revoked mandate or a deadline.
  const table: Table = negotiation.state === 'escalated' ? { ...replayed, status: 'escalated', endedReason: negotiation.endedReason } : replayed
  return {
    negotiation,
    language: rental?.language ?? 'en',
    lines: facts,
    descriptions: Object.fromEntries(lines.map((line) => [line.facts.lineId, { description: line.description, reason: line.reason }])),
    wearClauses: wearClauses(wearRules),
    renterPhotoIds,
    // The renter's own words when they contested, quoted data for whoever reads it.
    renterComments: replies.map((reply) => reply.comment ?? '').filter((comment) => comment.trim() !== ''),
    shopMandate,
    renterMandate,
    // Whom each side's agent acts for: the owner who granted the shop's mandate, the renter who granted theirs.
    grantors: { shop: mandateRows.find((row) => row.id === negotiation.shopMandateId)?.grantedByUserId ?? null, renter: mandateRows.find((row) => row.id === negotiation.renterMandateId)?.grantedByRenterId ?? null },
    context,
    table,
    moves,
  }
}
export type NegotiationRecords = NonNullable<Awaited<ReturnType<typeof negotiationRecords>>>

// The transcript both people can read (section 9.7): the moves, their grounds and evidence, how it ended. Never either
// side's limits.
export async function negotiationTranscript(transaction: Transaction, rentalId: string) {
  const records = await rentalNegotiation(transaction, rentalId)
  return records === undefined ? undefined : transcriptOf(records, await isSample(transaction, rentalId))
}

async function rentalNegotiation(transaction: Transaction, rentalId: string) {
  const [claim] = await transaction.select({ id: claims.id }).from(claims).where(eq(claims.rentalId, rentalId))
  if (claim === undefined) return undefined
  const [row] = await transaction.select({ id: negotiations.id }).from(negotiations).where(and(eq(negotiations.claimId, claim.id), eq(negotiations.rentalId, rentalId)))
  return row === undefined ? undefined : negotiationRecords(transaction, row.id)
}

// Whether a side's mandate asks that side for the final tap; a limit that cannot be read asks for it.
const asksForTap = (mandate: Mandate | null, kind: 'settlement_shop' | 'settlement_renter') => {
  if (mandate === null) return false
  const limits = kind === 'settlement_shop' ? checkSettlementLimits(kind, mandate.limits) : checkSettlementLimits(kind, mandate.limits)
  return !limits.ok || limits.value.finalTap
}

// What the shop's screens read: the transcript and whether an agreement waits for the owner or a manager. Never the
// renter's limit.
export async function shopNegotiation(transaction: Transaction, rentalId: string) {
  const records = await rentalNegotiation(transaction, rentalId)
  if (records === undefined) return undefined
  const { negotiation } = records
  return { transcript: transcriptOf(records, await isSample(transaction, rentalId)), awaitingShop: negotiation.state === 'agreed' && negotiation.shopConfirmedAt === null && asksForTap(records.shopMandate, 'settlement_shop') }
}
export type ShopNegotiation = NonNullable<Awaited<ReturnType<typeof shopNegotiation>>>

// What the renter's screens read: the transcript, their own highest total, whether an agreement waits for them and
// whether they stopped their advocate. Never the shop's limits.
export async function renterNegotiation(transaction: Transaction, rentalId: string) {
  const records = await rentalNegotiation(transaction, rentalId)
  if (records === undefined) return undefined
  const { negotiation, renterMandate } = records
  const own = checkSettlementLimits('settlement_renter', renterMandate.limits)
  return {
    transcript: transcriptOf(records, await isSample(transaction, rentalId)),
    highestTotalCents: own.ok ? own.value.highestTotalCents : 0,
    awaitingRenter: negotiation.state === 'agreed' && negotiation.renterConfirmedAt === null && asksForTap(renterMandate, 'settlement_renter'),
    stopped: renterMandate.revokedAt !== null,
    // Who argues for the renter: Hold's advocate, or the renter's own assistant.
    advocate: isAssistantAdvocate(renterMandate.grantedTo) ? 'assistant' as const : 'hold' as const,
  }
}
export type RenterNegotiation = NonNullable<Awaited<ReturnType<typeof renterNegotiation>>>

// A sample rental's negotiation is shown as one: its renter and their limit were made up for the demonstration.
async function isSample(transaction: Transaction, rentalId: string) {
  const [rental] = await transaction.select({ simulated: rentals.simulated }).from(rentals).where(eq(rentals.id, rentalId))
  return rental?.simulated === true
}

function transcriptOf(records: NegotiationRecords, sample = false) {
  const { negotiation } = records
  return {
    id: negotiation.id,
    kind: negotiation.kind,
    state: negotiation.state,
    endedReason: negotiation.endedReason,
    currency: negotiation.currency,
    claimTotalCents: negotiation.claimTotalCents,
    agreedCents: negotiation.agreed?.totalCents ?? null,
    deadline: negotiation.deadline,
    roundLimit: negotiation.roundLimit,
    shopConfirmedAt: negotiation.shopConfirmedAt,
    renterConfirmedAt: negotiation.renterConfirmedAt,
    simulated: negotiation.simulated || records.moves.some((move) => move.model === 'simulated'),
    sample,
    chainVerified: verifyTranscript(records.moves).ok,
    lines: records.lines.map((line) => ({ lineId: line.lineId, publishedCents: line.publishedCents, description: records.descriptions[line.lineId]?.description ?? '' })),
    wearClauses: records.wearClauses,
    moves: records.moves.map((move) => ({ sequence: move.sequence, side: move.side, kind: move.kind, lines: move.lines, totalCents: move.totalCents, passReason: move.passReason, actor: move.actor, model: move.model, createdAt: move.createdAt, fingerprint: move.fingerprint })),
  }
}
export type NegotiationTranscript = NonNullable<Awaited<ReturnType<typeof negotiationTranscript>>>
