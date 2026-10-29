import type { ClaimState, Region } from '@hold/domain'
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { incidentEvidence } from './claim-query.ts'
import { extensionPaymentsToCheck } from './extension-repository.ts'
import type { ExtensionPaymentToCheck } from './extension-repository.ts'
import { incidentsWaitingForStaff } from './incident-repository.ts'
import { dropOffsWaiting } from './self-return-repository.ts'
import type { WaitingDropOff } from './self-return-repository.ts'
import type { ShopIncident } from './incident-repository.ts'
import { morningQueue } from './ops-repository.ts'
import type { QueueEntry } from './ops-repository.ts'
import { authorizations, claimLines, claimReplies, claims, comparisons, findings, holds, photos, priceEntries, rentals, renters, staffRoles } from './schema/index.ts'
import type { Transaction } from './scope.ts'
import { activeHolds, lateRentals } from './shop-today.ts'
import type { ActiveHold, LateRental } from './shop-today.ts'

// What the decision board reads (extensions.md section 12.5): every record that waits on a person. Plain rows; what
// each one asks of whom, and in what order, is worked out from them by plain code on the way to the screen.

// The claims a person must still decide: one to approve, one the renter contested, and one the advocates could not settle.
export const DECISION_CLAIM_STATES = ['awaiting_approval', 'contested', 'escalated'] as const satisfies readonly ClaimState[]
export type DecisionClaimState = (typeof DECISION_CLAIM_STATES)[number]

export type DecisionClaimLine = {
  readonly id: string
  readonly description: string
  readonly amountCents: number
  readonly source: 'finding' | 'person' | 'agreed_in_rental'
  // A named person's written reason, for a line without photographs.
  readonly reason: string | null
  // Where the mark is on the return photograph, and the display copies of the two photographs of its view.
  readonly region: Region | null
  readonly beforeKey: string | null
  readonly afterKey: string | null
}

export type DecisionClaim = {
  readonly claimId: string
  readonly rentalId: string
  readonly renterName: string | null
  readonly state: DecisionClaimState
  readonly totalCents: number
  readonly currency: string
  readonly raisedByUserId: string | null
  readonly createdAt: Date
  // The hold the claim would be taken from, and the end of its validity: the date a decision must come before.
  readonly reservedCents: number | null
  readonly holdValidUntil: Date | null
  // The renter's own words. Quoted data, shown as written and never acted on.
  readonly renterComment: string | null
  readonly simulated: boolean
  readonly lines: readonly DecisionClaimLine[]
}

export type DecisionRecords = {
  readonly claims: readonly DecisionClaim[]
  readonly proposals: readonly QueueEntry[]
  readonly incidents: readonly ShopIncident[]
  readonly holds: readonly ActiveHold[]
  readonly late: readonly LateRental[]
  // Items renters dropped off with nobody at the counter, which a person has not checked yet.
  readonly dropOffs: readonly WaitingDropOff[]
  // Money PayPal moved for extra days that Hold did not apply as quoted, which an owner or manager checks.
  readonly extensionPayments: readonly ExtensionPaymentToCheck[]
  // A shop of one has nobody else to decide a claim its owner raised (architecture.md section 7.3).
  readonly staffCount: number
}

const isDecisionState = (state: ClaimState): state is DecisionClaimState => DECISION_CLAIM_STATES.some((each) => each === state)

async function waitingClaims(transaction: Transaction): Promise<DecisionClaim[]> {
  const latestComment = transaction.select({ comment: claimReplies.comment }).from(claimReplies).where(eq(claimReplies.claimId, claims.id)).orderBy(desc(claimReplies.createdAt)).limit(1)
  const rows = await transaction
    .select({
      claimId: claims.id,
      rentalId: claims.rentalId,
      renterName: renters.name,
      state: claims.state,
      totalCents: claims.totalCents,
      currency: claims.currency,
      raisedByUserId: claims.raisedByUserId,
      createdAt: claims.createdAt,
      reservedCents: holds.reservedCents,
      holdValidUntil: authorizations.validUntil,
      renterComment: sql<string | null>`(${latestComment})`,
      simulated: rentals.simulated,
    })
    .from(claims)
    .innerJoin(rentals, eq(rentals.id, claims.rentalId))
    .leftJoin(renters, eq(renters.id, rentals.renterId))
    .leftJoin(holds, eq(holds.rentalId, claims.rentalId))
    .leftJoin(authorizations, eq(authorizations.id, holds.currentAuthorizationId))
    .where(inArray(claims.state, [...DECISION_CLAIM_STATES]))
    .orderBy(asc(claims.createdAt), asc(claims.id))
  const lines = await linesOf(transaction, rows.map((row) => row.claimId))
  return rows.flatMap((row) => (isDecisionState(row.state) ? [{ ...row, state: row.state, lines: lines.get(row.claimId) ?? [] }] : []))
}

// Every line of the given claims, with the photographs behind it, in three reads however many claims there are.
async function linesOf(transaction: Transaction, claimIds: readonly string[]): Promise<Map<string, DecisionClaimLine[]>> {
  const byClaim = new Map<string, DecisionClaimLine[]>()
  if (claimIds.length === 0) return byClaim
  const rows = await transaction
    .select({
      id: claimLines.id,
      claimId: claimLines.claimId,
      description: priceEntries.description,
      amountCents: claimLines.amountCents,
      source: claimLines.source,
      reason: claimLines.reason,
      incidentId: claimLines.incidentId,
      view: findings.view,
      region: findings.region,
      beforeSession: comparisons.handoverSessionId,
      afterSession: comparisons.returnSessionId,
    })
    .from(claimLines)
    .innerJoin(priceEntries, eq(priceEntries.id, claimLines.priceEntryId))
    .leftJoin(findings, eq(findings.id, claimLines.findingId))
    .leftJoin(comparisons, eq(comparisons.id, findings.comparisonId))
    .where(inArray(claimLines.claimId, [...claimIds]))
    .orderBy(asc(claimLines.createdAt), asc(claimLines.id))
  const sessions = [...new Set(rows.flatMap((row) => [row.beforeSession, row.afterSession]).filter((session): session is string => session !== null))]
  const shown = sessions.length === 0 ? [] : await transaction.select({ sessionId: photos.sessionId, view: photos.view, key: photos.displayKey }).from(photos).where(and(inArray(photos.sessionId, sessions), isNull(photos.supersededAt)))
  const keyOf = (session: string | null, view: string | null) => (session === null || view === null ? null : (shown.find((photo) => photo.sessionId === session && photo.view === view)?.key ?? null))
  for (const row of rows) {
    // A line the renter agreed during the rental shows the handover photograph and theirs, with the box they drew.
    const reported = row.incidentId === null || row.view !== null ? undefined : await incidentEvidence(transaction, row.incidentId)
    const line: DecisionClaimLine = {
      id: row.id,
      description: row.description,
      amountCents: row.amountCents,
      source: row.source,
      reason: row.reason,
      region: row.region ?? reported?.region ?? null,
      beforeKey: reported?.beforeKey ?? keyOf(row.beforeSession, row.view),
      afterKey: reported?.afterKey ?? keyOf(row.afterSession, row.view),
    }
    byClaim.set(row.claimId, [...(byClaim.get(row.claimId) ?? []), line])
  }
  return byClaim
}

export async function decisionRecords(transaction: Transaction, now: Date): Promise<DecisionRecords> {
  const [staff] = await transaction.select({ count: count() }).from(staffRoles)
  return {
    claims: await waitingClaims(transaction),
    proposals: await morningQueue(transaction, now),
    incidents: await incidentsWaitingForStaff(transaction),
    holds: await activeHolds(transaction),
    late: await lateRentals(transaction, now),
    dropOffs: await dropOffsWaiting(transaction),
    extensionPayments: await extensionPaymentsToCheck(transaction),
    staffCount: staff?.count ?? 0,
  }
}
