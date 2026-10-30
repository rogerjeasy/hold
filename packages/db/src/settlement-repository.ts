import { CLAIM_TRANSITIONS, HOLD_TRANSITIONS, mayCapture, mayCloseRental, money, RENTAL_TRANSITIONS, settle, transition } from '@hold/domain'
import { closeRentalIncidents } from './incident-closing.ts'
import { and, eq } from 'drizzle-orm'
import { reserveEvidencePack } from './evidence-repository.ts'
import { queueSettlementReceipts } from './receipt-repository.ts'
import { markExecutionSent } from './fee-repository.ts'
import { approvals, auditLog, authorizations, claims, executions, holds, moneyEvents, rentals } from './schema/index.ts'
import type { Transaction } from './scope.ts'
import { recordFindingOutcomes } from './scorecard-repository.ts'
import { writeRentalOutcome } from './trust-repository.ts'
import { openRepairsForClaim } from './repair-repository.ts'

export async function settlementWork(transaction: Transaction, executionId: string) {
  const [execution] = await transaction.select().from(executions).where(eq(executions.id, executionId)).for('update')
  if (execution === undefined || execution.holdId === null) return undefined
  const [hold] = await transaction.select().from(holds).where(eq(holds.id, execution.holdId)).for('update')
  if (hold === undefined || hold.currentAuthorizationId === null) return undefined
  const [authorization] = await transaction.select().from(authorizations).where(eq(authorizations.id, hold.currentAuthorizationId))
  const [claim] = await transaction.select().from(claims).where(eq(claims.rentalId, execution.rentalId))
  return authorization === undefined ? undefined : { execution, hold, authorization, claim }
}

export async function saveSettlementResource(transaction: Transaction, executionId: string, kind: 'capture' | 'refund', resourceId: string, now: Date) {
  const work = await settlementWork(transaction, executionId)
  if (work === undefined || work.execution.state === 'confirmed') return
  await transaction.update(executions).set({ state: 'submitted', paypalResourceIds: { ...work.execution.paypalResourceIds, [kind]: resourceId }, updatedAt: now }).where(eq(executions.id, executionId))
}

export async function closeSettledRental(transaction: Transaction, rentalId: string, holdState: Parameters<typeof mayCloseRental>[0], now: Date) {
  const [rental] = await transaction.select().from(rentals).where(eq(rentals.id, rentalId)).for('update')
  const [claim] = await transaction.select({ state: claims.state }).from(claims).where(eq(claims.rentalId, rentalId))
  if (claim !== undefined && claim.state !== 'closed') return
  const outstanding = await transaction.select({ id: authorizations.id }).from(authorizations).innerJoin(holds, eq(holds.id, authorizations.holdId)).where(and(eq(holds.rentalId, rentalId), eq(authorizations.state, 'created')))
  if (outstanding.length > 0) return
  if (rental !== undefined && mayCloseRental(holdState) && transition(RENTAL_TRANSITIONS, rental.state, 'closed').ok) {
    await transaction.update(rentals).set({ state: 'closed' }).where(eq(rentals.id, rentalId))
    await closeRentalIncidents(transaction, rentalId, now)
    // The renter's Clean Record gains this rental's outcome in the same transaction (extensions.md section 7.4).
    await writeRentalOutcome(transaction, rentalId, now)
    await transaction.insert(auditLog).values({ shopId: rental.shopId, actorKind: 'worker', action: 'rental.settled', subjectKind: 'rental', subjectId: rentalId, at: now })
    await recordFindingOutcomes(transaction, rentalId, now)
    await reserveEvidencePack(transaction, rentalId, now)
  }
}

export async function confirmReturnReleased(transaction: Transaction, executionId: string, read: { readonly authorizationId: string; readonly status: string; readonly amount: { readonly cents: number; readonly currency: string } }, now: Date) {
  const work = await settlementWork(transaction, executionId)
  if (work === undefined || work.execution.action !== 'release') return false
  if (work.execution.state === 'confirmed') return true
  const expired = read.status === 'expired'
  const target = expired ? 'expired' : 'released'
  if (!['voided', 'expired'].includes(read.status) || read.authorizationId !== work.execution.paypalResourceIds['authorization'] || read.amount.currency !== work.hold.currency || read.amount.cents !== work.authorization.amountCents || (work.hold.state !== target && !transition(HOLD_TRANSITIONS, work.hold.state, target).ok)) return false
  await transaction.update(authorizations).set({ state: expired ? 'expired' : 'voided' }).where(eq(authorizations.id, work.authorization.id))
  await transaction.update(holds).set({ state: target }).where(eq(holds.id, work.hold.id))
  if (!expired) await transaction.insert(moneyEvents).values({ shopId: work.hold.shopId, rentalId: work.hold.rentalId, holdId: work.hold.id, kind: 'hold_released', currency: work.hold.currency, amountCents: work.hold.reservedCents, paypalReference: `${read.authorizationId}:voided`, occurredAt: now }).onConflictDoNothing()
  await transaction.update(executions).set({ state: 'confirmed', lastError: null, updatedAt: now }).where(eq(executions.id, executionId))
  await markExecutionSent(transaction, executionId, now)
  const claim = work.claim
  if (claim !== undefined && transition(CLAIM_TRANSITIONS, claim.state, 'closed').ok) await transaction.update(claims).set({ state: 'closed' }).where(eq(claims.id, claim.id))
  await closeSettledRental(transaction, work.hold.rentalId, target, now)
  await reserveEvidencePack(transaction, work.hold.rentalId, now)
  if (!expired) await queueSettlementReceipts(transaction, work.hold.rentalId, now, [`${read.authorizationId}:voided`])
  return true
}

export async function confirmClaimCaptured(transaction: Transaction, executionId: string, capture: { readonly captureId: string; readonly authorizationId: string; readonly status: string; readonly finalCapture: boolean; readonly amount: { readonly cents: number; readonly currency: string }; readonly createdAt: Date }, authorization: { readonly authorizationId: string; readonly status: string }, now: Date) {
  const work = await settlementWork(transaction, executionId)
  if (work === undefined || work.claim === undefined || work.execution.action !== 'capture') return false
  if (work.execution.state === 'confirmed') return true
  const { claim, hold, execution } = work
  const amounts = settle(money(claim.totalCents, claim.currency), money(hold.reservedCents, hold.currency))
  if (work.authorization.paypalAuthorizationId !== execution.paypalResourceIds['authorization'] || !mayCapture(claim.state) || capture.status !== 'completed' || !capture.finalCapture || capture.amount.cents !== execution.amountCents || capture.amount.cents !== amounts.capture.cents || capture.amount.currency !== execution.currency || capture.authorizationId !== execution.paypalResourceIds['authorization'] || capture.captureId !== execution.paypalResourceIds['capture'] || authorization.authorizationId !== capture.authorizationId || authorization.status !== 'captured') return false
  if (hold.state !== 'capturing' && !transition(HOLD_TRANSITIONS, hold.state, 'capturing').ok) return false
  if (hold.state !== 'capturing') await transaction.update(holds).set({ state: 'capturing' }).where(eq(holds.id, hold.id))
  if (!transition(HOLD_TRANSITIONS, 'capturing', 'captured').ok || !transition(CLAIM_TRANSITIONS, claim.state, 'charged').ok) return false
  await transaction.update(holds).set({ state: 'captured' }).where(eq(holds.id, hold.id))
  await transaction.update(authorizations).set({ state: 'captured' }).where(eq(authorizations.id, work.authorization.id))
  await transaction.update(claims).set({ state: 'charged' }).where(eq(claims.id, claim.id))
  // The damage paid for goes on the item's passport, and a repair opens for each item (architecture.md section 9.6).
  await openRepairsForClaim(transaction, claim.id, now)
  await transaction.insert(moneyEvents).values({ shopId: hold.shopId, rentalId: hold.rentalId, holdId: hold.id, kind: 'hold_captured', currency: capture.amount.currency, amountCents: capture.amount.cents, paypalReference: capture.captureId, occurredAt: capture.createdAt }).onConflictDoNothing()
  if (amounts.release.cents > 0) await transaction.insert(moneyEvents).values({ shopId: hold.shopId, rentalId: hold.rentalId, holdId: hold.id, kind: 'hold_released', currency: hold.currency, amountCents: amounts.release.cents, paypalReference: `${authorization.authorizationId}:remainder`, occurredAt: now }).onConflictDoNothing()
  await transaction.update(executions).set({ state: 'confirmed', lastError: null, updatedAt: now }).where(eq(executions.id, executionId))
  await markExecutionSent(transaction, executionId, now)
  return true
}

export async function mayExecuteSettlement(transaction: Transaction, executionId: string): Promise<boolean> {
  const work = await settlementWork(transaction, executionId)
  if (work === undefined) return false
  const { execution, hold, claim } = work
  if (execution.currency !== hold.currency || execution.amountCents === null || execution.amountCents <= 0) return false
  if (execution.action === 'capture') {
    if (claim === undefined || !mayCapture(claim.state) || execution.paypalResourceIds['claim'] !== claim.id || execution.amountCents !== settle(money(claim.totalCents, claim.currency), money(hold.reservedCents, hold.currency)).capture.cents || execution.paypalResourceIds['authorization'] !== work.authorization.paypalAuthorizationId) return false
    const approved = await transaction.select().from(approvals).where(and(eq(approvals.subject, 'claim'), eq(approvals.subjectId, claim.id), eq(approvals.decision, 'approved')))
    return approved.some((approval) => approval.changes.some((change) => typeof change['totalCents'] === 'number' && change['totalCents'] >= claim.totalCents))
  }
  if (execution.action === 'release') return ['releasing', 'expired'].includes(hold.state) && execution.paypalResourceIds['authorization'] === work.authorization.paypalAuthorizationId && (await transaction.select().from(approvals).where(and(eq(approvals.subject, 'release'), eq(approvals.subjectId, hold.id), eq(approvals.decision, 'approved')))).length > 0
  if (execution.action === 'refund' && claim !== undefined) {
    const approved = await transaction.select().from(approvals).where(and(eq(approvals.subject, 'refund'), eq(approvals.subjectId, claim.id), eq(approvals.decision, 'approved')))
    const events = await transaction.select().from(moneyEvents).where(eq(moneyEvents.rentalId, claim.rentalId))
    const refundable = events.filter((event) => event.kind === 'hold_captured').reduce((sum, event) => sum + event.amountCents, 0) - events.filter((event) => event.kind === 'refunded').reduce((sum, event) => sum + event.amountCents, 0)
    return claim.state === 'charged' && execution.amountCents <= refundable && approved.some((approval) => approval.changes.some((change) => change['totalCents'] === execution.amountCents && change['captureId'] === execution.paypalResourceIds['capture']))
  }
  return false
}
