import { CLAIM_TRANSITIONS, REFUND_KINDS, transition } from '@hold/domain'
import { and, eq } from 'drizzle-orm'
import { queueSettlementReceipts } from './receipt-repository.ts'
import { EXECUTIONS_QUEUE, markExecutionSent } from './fee-repository.ts'
import { closeSettledRental, settlementWork } from './settlement-repository.ts'
import { approvals, claims, executions, moneyEvents, outbox } from './schema/index.ts'
import type { Transaction } from './scope.ts'

export async function queueClaimRefund(transaction: Transaction, claimId: string, userId: string, reason: string, now: Date) {
  const [claim] = await transaction.select().from(claims).where(eq(claims.id, claimId)).for('update')
  if (claim?.state !== 'charged') return { ok: false, reason: 'not_refundable' } as const
  const key = `claim-refund-${claim.id}`
  const [existing] = await transaction.select().from(executions).where(eq(executions.idempotencyKey, key))
  if (existing !== undefined) return { ok: true, rentalId: claim.rentalId, executionId: existing.id } as const
  const capture = (await transaction.select().from(executions).where(and(eq(executions.rentalId, claim.rentalId), eq(executions.action, 'capture'), eq(executions.state, 'confirmed')))).find((row) => row.paypalResourceIds['claim'] === claim.id)
  const captureId = capture?.paypalResourceIds['capture']
  if (capture === undefined || captureId === undefined || capture.amountCents === null || capture.currency === null) return { ok: false, reason: 'not_refundable' } as const
  await transaction.insert(approvals).values({ shopId: claim.shopId, subject: 'refund', subjectId: claim.id, decidedByUserId: userId, decision: 'approved', method: 'on_screen', changes: [{ reason, totalCents: capture.amountCents, captureId }], createdAt: now })
  const [created] = await transaction.insert(executions).values({ shopId: claim.shopId, rentalId: claim.rentalId, holdId: capture.holdId, action: 'refund', idempotencyKey: key, currency: capture.currency, amountCents: capture.amountCents, paypalResourceIds: { claim: claim.id, capture: captureId }, createdAt: now, updatedAt: now }).returning()
  if (created === undefined) throw new Error('The refund was not queued.')
  await transaction.insert(outbox).values({ shopId: claim.shopId, queue: EXECUTIONS_QUEUE, messageGroup: claim.rentalId, payload: { executionId: created.id }, createdAt: now })
  return { ok: true, rentalId: claim.rentalId, executionId: created.id } as const
}

export async function confirmClaimRefund(transaction: Transaction, executionId: string, read: { readonly refundId: string; readonly captureId: string; readonly status: string; readonly amount: { readonly cents: number; readonly currency: string }; readonly createdAt: Date }, now: Date) {
  const work = await settlementWork(transaction, executionId)
  if (work === undefined || work.claim === undefined || work.execution.action !== 'refund') return false
  if (work.execution.state === 'confirmed') return true
  const [approval] = await transaction.select().from(approvals).where(and(eq(approvals.subject, 'refund'), eq(approvals.subjectId, work.claim.id), eq(approvals.decision, 'approved')))
  if (approval === undefined || work.claim.state !== 'charged' || read.status !== 'completed' || read.captureId !== work.execution.paypalResourceIds['capture'] || read.amount.cents !== work.execution.amountCents || read.amount.currency !== work.execution.currency) return false
  const events = await transaction.select().from(moneyEvents).where(eq(moneyEvents.rentalId, work.claim.rentalId))
  const captured = events.filter((event) => event.kind === 'hold_captured').reduce((sum, event) => sum + event.amountCents, 0)
  // This refund itself is never counted against itself, however PayPal's event and Hold's read-back met.
  const refunded = events.filter((event) => REFUND_KINDS.includes(event.kind) && event.paypalReference !== read.refundId).reduce((sum, event) => sum + event.amountCents, 0)
  if (read.amount.cents + refunded > captured) return false
  if (!transition(CLAIM_TRANSITIONS, work.claim.state, 'adjusted').ok) return false
  await transaction.insert(moneyEvents).values({ shopId: work.claim.shopId, rentalId: work.claim.rentalId, holdId: work.hold.id, kind: 'refunded', currency: read.amount.currency, amountCents: read.amount.cents, paypalReference: read.refundId, returnedFrom: read.captureId, occurredAt: read.createdAt }).onConflictDoNothing()
  await transaction.update(claims).set({ state: 'adjusted' }).where(eq(claims.id, work.claim.id))
  if (transition(CLAIM_TRANSITIONS, 'adjusted', 'closed').ok) await transaction.update(claims).set({ state: 'closed' }).where(eq(claims.id, work.claim.id))
  await transaction.update(executions).set({ state: 'confirmed', lastError: null, paypalResourceIds: { ...work.execution.paypalResourceIds, refund: read.refundId }, updatedAt: now }).where(eq(executions.id, executionId))
  await markExecutionSent(transaction, executionId, now)
  await closeSettledRental(transaction, work.claim.rentalId, work.hold.state, now)
  await queueSettlementReceipts(transaction, work.claim.rentalId, now, [read.refundId])
  return true
}
