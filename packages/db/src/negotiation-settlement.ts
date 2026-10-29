import { checkSettlementLimits } from '@hold/domain'
import type { Mandate } from '@hold/domain'
import { count, eq } from 'drizzle-orm'
import { claimStaff } from './claim-access.ts'
import { liveLink, storeRenterCode } from './claim-code-repository.ts'
import { markClaimDecided } from './claim-promise-repository.ts'
import { queueClaimCapture } from './claim-reply-repository.ts'
import { escalateNegotiation } from './negotiation-ending.ts'
import { negotiationRecords } from './negotiation-view.ts'
import { approvals, auditLog, claims, negotiations, staffRoles } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// Settling an agreement (extensions.md section 9.9). Each side whose mandate asks for a final tap confirms: on the
// shop's side the owner or a manager, as for any decision on a contested claim; on the renter's side the renter with a
// one-time code, checked before this is called. Then the claim reaches charging and the spine's capture takes over.

export type SettleResult = { readonly ok: true; readonly executionId: null } | { readonly ok: true; readonly executionId: string; readonly rentalId: string }
const nothing: SettleResult = { ok: true, executionId: null }

const live = (mandate: Mandate | null, now: Date) => mandate !== null && (mandate.revokedAt === null || mandate.revokedAt > now) && mandate.validFrom <= now && now < mandate.validUntil

export async function confirmAgreement(transaction: Transaction, negotiationId: string, who: { readonly kind: 'staff'; readonly userId: string } | { readonly kind: 'renter' }, decision: 'confirm' | 'decline', now: Date) {
  const [negotiation] = await transaction.select().from(negotiations).where(eq(negotiations.id, negotiationId)).for('update')
  if (negotiation === undefined || negotiation.kind !== 'negotiation') return { ok: false, reason: 'not_found' } as const
  if (negotiation.state !== 'agreed') return { ok: false, reason: 'not_agreed' } as const
  if (who.kind === 'staff') {
    const [claim] = await transaction.select({ raisedBy: claims.raisedByUserId, currency: claims.currency }).from(claims).where(eq(claims.id, negotiation.claimId))
    const [staff] = await transaction.select({ count: count() }).from(staffRoles)
    const allowed = await claimStaff(transaction, who.userId, claim?.currency ?? negotiation.currency, { kind: 'decide_contested_claim', raisedBy: claim?.raisedBy ?? '', shopStaffCount: staff?.count ?? 0 })
    if (!allowed.ok) return allowed
  }
  // The hold's life still rules, and so do the mandates: past the deadline, or with either ended, the owner decides.
  const records = await negotiationRecords(transaction, negotiationId)
  if (now >= negotiation.deadline) return ended(transaction, negotiationId, 'deadline', now)
  if (!live(records?.shopMandate ?? null, now) || !live(records?.renterMandate ?? null, now)) return ended(transaction, negotiationId, 'mandate_ended', now)
  if (decision === 'decline') return ended(transaction, negotiationId, 'declined', now)
  if (who.kind === 'staff' && negotiation.shopConfirmedAt === null) await transaction.update(negotiations).set({ shopConfirmedByUserId: who.userId, shopConfirmedAt: now, updatedAt: now }).where(eq(negotiations.id, negotiationId))
  if (who.kind === 'renter' && negotiation.renterConfirmedAt === null) await transaction.update(negotiations).set({ renterConfirmedAt: now, updatedAt: now }).where(eq(negotiations.id, negotiationId))
  return settleIfConfirmed(transaction, negotiationId, now)
}

// The renter's one-time code to confirm or decline an agreement (section 9.9): only through a live link that may
// accept, only while an agreement awaits them, sent where every renter money decision's code goes.
export async function issueSettlementCode(transaction: Transaction, linkId: string, hash: string, now: Date) {
  const link = await liveLink(transaction, linkId, ['accept'], now)
  if (link === undefined) return { ok: false, reason: 'link_invalid' } as const
  const [negotiation] = await transaction.select({ state: negotiations.state, kind: negotiations.kind, renterConfirmedAt: negotiations.renterConfirmedAt }).from(negotiations).where(eq(negotiations.rentalId, link.rentalId))
  if (negotiation?.state !== 'agreed' || negotiation.renterConfirmedAt !== null) return { ok: false, reason: 'not_agreed' } as const
  return storeRenterCode(transaction, link, hash, now)
}

async function ended(transaction: Transaction, negotiationId: string, reason: 'deadline' | 'mandate_ended' | 'declined', now: Date): Promise<SettleResult> {
  await escalateNegotiation(transaction, negotiationId, reason, now)
  return nothing
}

// Once everyone who must confirm has, the agreed total becomes the claim's total, an approval records both mandates and
// the last move's fingerprint with the method mandate, and the capture is queued through the outbox as the final capture.
export async function settleIfConfirmed(transaction: Transaction, negotiationId: string, now: Date): Promise<SettleResult> {
  const records = await negotiationRecords(transaction, negotiationId)
  if (records?.negotiation.state !== 'agreed' || records.negotiation.agreed === null || records.shopMandate === null) return nothing
  const { negotiation } = records
  const agreed = negotiation.agreed
  if (agreed === null) return nothing
  const shopLimits = checkSettlementLimits('settlement_shop', records.shopMandate.limits)
  const renterLimits = checkSettlementLimits('settlement_renter', records.renterMandate.limits)
  // A limit that cannot be read asks for every tap: the safer reading.
  const shopTap = !shopLimits.ok || shopLimits.value.finalTap
  const renterTap = !renterLimits.ok || renterLimits.value.finalTap
  if ((shopTap && negotiation.shopConfirmedAt === null) || (renterTap && negotiation.renterConfirmedAt === null)) return nothing
  const [claim] = await transaction.select().from(claims).where(eq(claims.id, negotiation.claimId)).for('update')
  if (claim?.state !== 'agreed' || agreed.totalCents > claim.totalCents) throw new Error('An agreement can only lower an agreed claim.')
  await transaction.insert(approvals).values({
    shopId: negotiation.shopId, subject: 'claim', subjectId: claim.id, decidedByUserId: negotiation.shopConfirmedByUserId, decision: 'approved', method: 'mandate', mandateId: records.shopMandate.id,
    changes: [{ totalCents: agreed.totalCents, previousTotalCents: claim.totalCents, lines: agreed.lines.map((line) => ({ lineId: line.lineId, cents: line.cents, ground: line.ground })), shopMandateId: records.shopMandate.id, renterMandateId: records.renterMandate.id, lastMoveFingerprint: negotiation.headFingerprint, shopConfirmedAt: negotiation.shopConfirmedAt?.toISOString() ?? null, renterConfirmedAt: negotiation.renterConfirmedAt?.toISOString() ?? null }],
    createdAt: now,
  })
  await transaction.update(claims).set({ totalCents: agreed.totalCents }).where(eq(claims.id, claim.id))
  await markClaimDecided(transaction, claim, now)
  await transaction.update(negotiations).set({ state: 'settled', endedAt: now, updatedAt: now }).where(eq(negotiations.id, negotiationId))
  const capture = await queueClaimCapture(transaction, claim.id, now)
  if (!capture.ok) throw new Error(`The agreed claim could not be charged: ${capture.reason}.`)
  await transaction.insert(auditLog).values({ shopId: negotiation.shopId, actorKind: 'referee', action: 'negotiation.settled', subjectKind: 'negotiation', subjectId: negotiationId, detail: { totalCents: agreed.totalCents, executionId: capture.executionId }, at: now })
  return { ok: true, executionId: capture.executionId, rentalId: capture.rentalId }
}
