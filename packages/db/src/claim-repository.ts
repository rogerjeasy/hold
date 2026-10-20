import { reserveEvidencePack } from './evidence-repository.ts'
import { checkClaimLines, claimTotal, CLAIM_TRANSITIONS, HOLD_TRANSITIONS, money, transition } from '@hold/domain'
import type { ClaimLine } from '@hold/domain'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { claimStaff, startSettling } from './claim-access.ts'
import { EXECUTIONS_QUEUE } from './fee-repository.ts'
import { approvals, auditLog, authorizations, captureSessions, claimLines, claims, comparisons, executions, findings, holds, outbox, photos, priceEntries, rentalItems, rentals, shops } from './schema/index.ts'
import type { Transaction } from './scope.ts'

export type DraftClaimLine = { readonly priceEntryId: string; readonly findingId?: string; readonly reason?: string }
const refused = <Reason extends string>(reason: Reason) => ({ ok: false, reason }) as const

export async function draftClaim(transaction: Transaction, rentalId: string, userId: string, lines: readonly DraftClaimLine[], now: Date) {
  const [rental] = await transaction.select().from(rentals).where(eq(rentals.id, rentalId)).for('update')
  if (rental === undefined) return refused('not_found')
  const staff = await claimStaff(transaction, userId, rental.currency)
  if (!staff.ok) return staff
  const [existing] = await transaction.select().from(claims).where(eq(claims.rentalId, rentalId))
  if (existing !== undefined) return { ok: true, claimId: existing.id, totalCents: existing.totalCents } as const
  if (!['returned', 'inspecting'].includes(rental.state)) return refused('not_returned')
  if (rental.simulated) return refused('simulated_rental')
  if (lines.length === 0 || lines.length > 50) return refused('empty_claim')
  const agreed = await transaction.select().from(priceEntries).where(eq(priceEntries.priceListId, rental.priceListId))
  const priced: ClaimLine[] = []
  const stored: Omit<typeof claimLines.$inferInsert, 'claimId'>[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    const entry = agreed.find((entry) => entry.id === line.priceEntryId && entry.currency === rental.currency)
    if (entry === undefined) return refused('price_not_agreed')
    const identity = line.findingId ?? line.priceEntryId
    if (seen.has(identity)) return refused('duplicate_line')
    seen.add(identity)
    let source: ClaimLine['source']
    if (line.findingId !== undefined) {
      const [finding] = await transaction.select({ row: findings, simulated: comparisons.simulated, handoverId: comparisons.handoverSessionId, returnId: comparisons.returnSessionId }).from(findings)
        .innerJoin(comparisons, eq(comparisons.id, findings.comparisonId)).innerJoin(captureSessions, eq(captureSessions.id, comparisons.returnSessionId)).innerJoin(rentalItems, eq(rentalItems.id, captureSessions.rentalItemId))
        .where(and(eq(findings.id, line.findingId), eq(rentalItems.rentalId, rentalId), isNotNull(captureSessions.sealedAt)))
      if (finding === undefined || finding.simulated || !['new_damage', 'missing_part'].includes(finding.row.class) || finding.row.secondLookConfirmed !== true) return refused('finding_not_billable')
      const before = await transaction.select({ id: photos.id }).from(photos).where(and(eq(photos.sessionId, finding.handoverId), eq(photos.view, finding.row.view), isNull(photos.supersededAt)))
      const after = await transaction.select({ id: photos.id }).from(photos).where(and(eq(photos.sessionId, finding.returnId), eq(photos.view, finding.row.view), isNull(photos.supersededAt)))
      source = { kind: 'finding', findingId: line.findingId, photoCount: before.length > 0 && after.length > 0 ? 2 : 0 }
    } else source = { kind: 'person', staffId: userId, reason: line.reason?.trim() ?? '' }
    priced.push({ priceEntryId: entry.id, amount: money(entry.amountCents, entry.currency), source })
    stored.push({ shopId: rental.shopId, priceEntryId: entry.id, currency: entry.currency, amountCents: entry.amountCents, source: source.kind, findingId: source.kind === 'finding' ? source.findingId : null, addedByUserId: userId, reason: source.kind === 'person' ? source.reason : null, createdAt: now })
  }
  if (!checkClaimLines(priced).ok) return refused('line_without_evidence')
  const total = claimTotal(priced, rental.currency)
  if (total.cents === 0) return refused('empty_claim')
  const [created] = await transaction.insert(claims).values({ shopId: rental.shopId, rentalId, currency: rental.currency, totalCents: total.cents, raisedByUserId: userId, createdAt: now }).returning()
  if (created === undefined) throw new Error('The claim was not created.')
  await transaction.insert(claimLines).values(stored.map((line) => ({ ...line, claimId: created.id })))
  if (!transition(CLAIM_TRANSITIONS, created.state, 'awaiting_approval').ok) throw new Error('The new claim cannot await approval.')
  await transaction.update(claims).set({ state: 'awaiting_approval' }).where(eq(claims.id, created.id))
  await reserveEvidencePack(transaction, rentalId, now)
  return { ok: true, claimId: created.id, totalCents: total.cents } as const
}

export async function approveClaim(transaction: Transaction, claimId: string, userId: string, now: Date) {
  const [claim] = await transaction.select().from(claims).where(eq(claims.id, claimId)).for('update')
  if (claim === undefined) return refused('not_found')
  const allowed = await claimStaff(transaction, userId, claim.currency, { kind: 'approve_claim', total: money(claim.totalCents, claim.currency) })
  if (!allowed.ok) return allowed
  if (claim.state === 'approved' || claim.state === 'presented') return { ok: true, rentalId: claim.rentalId } as const
  if (!transition(CLAIM_TRANSITIONS, claim.state, 'approved').ok) return refused('not_awaiting_approval')
  const lines = await transaction.select().from(claimLines).where(eq(claimLines.claimId, claim.id))
  const total = lines.reduce((sum, line) => sum + line.amountCents, 0)
  if (lines.length === 0 || total !== claim.totalCents) return refused('line_without_evidence')
  await transaction.insert(approvals).values({ shopId: claim.shopId, subject: 'claim', subjectId: claim.id, decidedByUserId: userId, decision: 'approved', method: 'on_screen', changes: [{ lineIds: lines.map((line) => line.id), totalCents: total }], createdAt: now })
  await transaction.update(claims).set({ state: 'approved' }).where(eq(claims.id, claimId))
  await startSettling(transaction, claim.rentalId)
  await reserveEvidencePack(transaction, claim.rentalId, now)
  return { ok: true, rentalId: claim.rentalId } as const
}

export async function presentClaim(transaction: Transaction, claimId: string, userId: string, now: Date) {
  const [claim] = await transaction.select().from(claims).where(eq(claims.id, claimId)).for('update')
  if (claim === undefined) return refused('not_found')
  const staff = await claimStaff(transaction, userId, claim.currency)
  if (!staff.ok) return staff
  return openClaimReply(transaction, claim, now)
}

export async function acknowledgeClaimReview(transaction: Transaction, rentalId: string, now: Date) {
  const [claim] = await transaction.select().from(claims).where(eq(claims.rentalId, rentalId)).for('update')
  if (claim === undefined) return refused('not_found')
  return openClaimReply(transaction, claim, now)
}

async function openClaimReply(transaction: Transaction, claim: typeof claims.$inferSelect, now: Date) {
  if (claim.state === 'presented') return { ok: true, rentalId: claim.rentalId, replyDueAt: claim.replyDueAt } as const
  if (!transition(CLAIM_TRANSITIONS, claim.state, 'presented').ok) return refused('not_approved')
  const [shop] = await transaction.select().from(shops).where(eq(shops.id, claim.shopId))
  if (shop === undefined) return refused('not_found')
  const replyDueAt = new Date(now.getTime() + shop.replyPeriodHours * 3_600_000)
  await transaction.update(claims).set({ state: 'presented', presentedAt: now, replyDueAt }).where(eq(claims.id, claim.id))
  await transaction.insert(outbox).values({ shopId: claim.shopId, queue: 'upkeep', messageGroup: claim.rentalId, payload: { kind: 'claim_plan', claimId: claim.id }, createdAt: now })
  await reserveEvidencePack(transaction, claim.rentalId, now)
  return { ok: true, rentalId: claim.rentalId, replyDueAt } as const
}

export async function confirmCleanReturn(transaction: Transaction, rentalId: string, userId: string, reason: string, now: Date) {
  const [rental] = await transaction.select().from(rentals).where(eq(rentals.id, rentalId)).for('update')
  if (rental === undefined) return refused('not_found')
  const staff = await claimStaff(transaction, userId, rental.currency, { kind: 'release_after_clean_return' })
  if (!staff.ok) return staff
  const [hold] = await transaction.select().from(holds).where(eq(holds.rentalId, rentalId)).for('update')
  if (hold === undefined) return refused('not_found')
  const key = `return-release-${hold.id}`
  const [existing] = await transaction.select().from(executions).where(eq(executions.idempotencyKey, key))
  if (existing !== undefined) return { ok: true, executionId: existing.id, rentalId } as const
  if (reason.trim() === '') return refused('inspection_required')
  const [claim] = await transaction.select().from(claims).where(eq(claims.rentalId, rentalId))
  const returned = ['returned', 'inspecting'].includes(rental.state) || (rental.state === 'settling' && claim?.state === 'waived')
  if (!returned || (hold.state !== 'expired' && !transition(HOLD_TRANSITIONS, hold.state, 'releasing').ok)) return refused('not_returned')
  if (rental.simulated) return refused('simulated_rental')
  if (claim !== undefined && claim.state !== 'waived' && claim.state !== 'closed') return refused('claim_exists')
  const [authorization] = await transaction.select().from(authorizations).where(eq(authorizations.id, hold.currentAuthorizationId ?? '00000000-0000-0000-0000-000000000000'))
  if (authorization === undefined) return refused('not_found')
  await transaction.insert(approvals).values({ shopId: rental.shopId, subject: 'release', subjectId: hold.id, decidedByUserId: userId, decision: 'approved', method: 'on_screen', changes: [{ reason: reason.trim() }], createdAt: now })
  const [execution] = await transaction.insert(executions).values({ shopId: rental.shopId, rentalId, holdId: hold.id, action: 'release', idempotencyKey: key, currency: hold.currency, amountCents: hold.reservedCents, paypalResourceIds: { authorization: authorization.paypalAuthorizationId, purpose: 'return' }, createdAt: now, updatedAt: now }).returning()
  if (execution === undefined) throw new Error('The release execution was not created.')
  await transaction.insert(outbox).values({ shopId: rental.shopId, queue: EXECUTIONS_QUEUE, messageGroup: rentalId, payload: { executionId: execution.id }, createdAt: now })
  if (hold.state !== 'expired') await transaction.update(holds).set({ state: 'releasing' }).where(eq(holds.id, hold.id))
  await startSettling(transaction, rentalId)
  await transaction.insert(auditLog).values({ shopId: rental.shopId, actorKind: 'person', actorId: userId, action: 'return.clean_confirmed', subjectKind: 'rental', subjectId: rentalId, detail: { reason: reason.trim() }, at: now })
  await reserveEvidencePack(transaction, rentalId, now)
  return { ok: true, executionId: execution.id, rentalId } as const
}
