import { paymentLapsed, RENTAL_TRANSITIONS, transition } from '@hold/domain'
import { itemsStillFree } from './booking-repository.ts'
import { and, eq, sql } from 'drizzle-orm'
import { auditLog, executions, moneyEvents, outbox, rentals } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// The rental fee, paid through PayPal and captured through an execution (architecture.md section 7.6). Each step is
// safe to repeat: the execution's key is fixed by the rental and its order, and the money log by the capture.

export type FeeExecution = { readonly id: string; readonly rentalId: string; readonly orderId: string; readonly idempotencyKey: string; readonly amountCents: number; readonly currency: string }

export const EXECUTIONS_QUEUE = 'executions'

// Keeps the order the renter is approving, so a second visit reuses it.
export async function saveFeeOrder(transaction: Transaction, rentalId: string, orderId: string): Promise<void> {
  await transaction.update(rentals).set({ paypalFeeOrderId: orderId }).where(and(eq(rentals.id, rentalId), eq(rentals.state, 'pending_payment')))
}

export type BeginResult = { readonly ok: true; readonly execution: FeeExecution } | { readonly ok: false; readonly reason: 'not_found' | 'not_pending' | 'no_order' | 'payment_lapsed' }

// Records that the fee is to be captured: one execution with its idempotency key, and the outbox message that lets
// the worker finish it if this request does not. Asked again, it returns the same execution.
// `confirming` is for a capture PayPal already made, which is recorded whatever the rental's state: PayPal's record is
// the truth, and confirmFeeCapture asks a person to refund a booking let go in the meantime.
export async function beginFeeCapture(transaction: Transaction, rentalId: string, now: Date, options: { readonly confirming?: boolean } = {}): Promise<BeginResult> {
  const [rental] = await transaction
    .select({ shopId: rentals.shopId, state: rentals.state, orderId: rentals.paypalFeeOrderId, feeCents: rentals.feeCents, currency: rentals.currency, createdAt: rentals.createdAt })
    .from(rentals)
    .where(eq(rentals.id, rentalId))
    .for('update')
  if (rental === undefined) return { ok: false, reason: 'not_found' }
  if (rental.orderId === null) return { ok: false, reason: 'no_order' }
  const idempotencyKey = `fee-capture-${rentalId}-${rental.orderId}`
  const [existing] = await transaction.select().from(executions).where(eq(executions.idempotencyKey, idempotencyKey))
  if (existing !== undefined) return { ok: true, execution: { id: existing.id, rentalId, orderId: rental.orderId, idempotencyKey, amountCents: rental.feeCents, currency: rental.currency } }
  if (options.confirming !== true && rental.state !== 'pending_payment') return { ok: false, reason: 'not_pending' }
  // A booking past its time to pay no longer keeps its items. It may still be paid while nobody else has taken them.
  if (options.confirming !== true && paymentLapsed(rental.createdAt, now) && !(await itemsStillFree(transaction, rentalId, now))) return { ok: false, reason: 'payment_lapsed' }
  const [created] = await transaction
    .insert(executions)
    .values({ shopId: rental.shopId, rentalId, action: 'fee_capture', idempotencyKey, currency: rental.currency, amountCents: rental.feeCents, paypalResourceIds: { order: rental.orderId }, createdAt: now, updatedAt: now })
    .returning({ id: executions.id })
  if (created === undefined) throw new Error('The execution was not created.')
  await transaction.insert(outbox).values({ shopId: rental.shopId, queue: EXECUTIONS_QUEUE, messageGroup: rentalId, payload: { executionId: created.id }, createdAt: now })
  return { ok: true, execution: { id: created.id, rentalId, orderId: rental.orderId, idempotencyKey, amountCents: rental.feeCents, currency: rental.currency } }
}

export type CapturedFee = {
  readonly orderId: string
  readonly captureId: string
  readonly status: string
  readonly amount: { readonly cents: number; readonly currency: string }
  readonly payer: { readonly payerId: string; readonly email: string; readonly name: string | undefined }
}

export type ConfirmResult = { readonly ok: true } | { readonly ok: false; readonly reason: 'not_found' | 'amount_mismatch' | 'not_completed' }

// Applies what PayPal read back for the fee: the renter is who paid, the rental is booked, and the money log gets one
// line. Applying the same capture again changes nothing.
export async function confirmFeeCapture(transaction: Transaction, executionId: string, payment: CapturedFee, now: Date): Promise<ConfirmResult> {
  const [execution] = await transaction.select().from(executions).where(eq(executions.id, executionId)).for('update')
  if (execution === undefined) return { ok: false, reason: 'not_found' }
  if (execution.state === 'confirmed') return { ok: true }
  const fail = async (reason: 'amount_mismatch' | 'not_completed', detail: string) => {
    await transaction.update(executions).set({ state: 'failed', attempts: execution.attempts + 1, lastError: detail, updatedAt: now }).where(eq(executions.id, executionId))
    return { ok: false, reason } as const
  }
  if (payment.status !== 'completed') return fail('not_completed', `PayPal shows the capture as ${payment.status}.`)
  // PayPal's amount must be the fee the rental was booked for, to the cent.
  if (payment.amount.cents !== execution.amountCents || payment.amount.currency !== execution.currency) return fail('amount_mismatch', `PayPal captured ${String(payment.amount.cents)} ${payment.amount.currency}.`)

  const [renter] = await transaction
    .select({ id: sql<string>`renter.id` })
    .from(sql`hold_renter_for_payer(${payment.payer.payerId}, ${payment.payer.email}, ${payment.payer.name ?? null}) as renter(id)`)
  if (renter === undefined) throw new Error('hold_renter_for_payer returned no row.')
  const [rental] = await transaction.select({ state: rentals.state }).from(rentals).where(eq(rentals.id, execution.rentalId))
  if (rental === undefined) return { ok: false, reason: 'not_found' }
  // PayPal took the fee, and that is the truth. A booking let go in the meantime does not move back: a person is asked
  // to refund it.
  const booked = transition(RENTAL_TRANSITIONS, rental.state, 'booked')
  if (booked.ok) await transaction.update(rentals).set({ state: 'booked', renterId: renter.id }).where(eq(rentals.id, execution.rentalId))
  else if (rental.state !== 'booked') {
    await transaction.insert(auditLog).values({ shopId: execution.shopId, actorKind: 'system', action: 'fee.captured_on_closed_booking', subjectKind: 'rental', subjectId: execution.rentalId, detail: { state: rental.state }, at: now })
  }
  await transaction
    .insert(moneyEvents)
    .values({ shopId: execution.shopId, rentalId: execution.rentalId, kind: 'fee_captured', currency: payment.amount.currency, amountCents: payment.amount.cents, paypalReference: payment.captureId, occurredAt: now })
    .onConflictDoNothing()
  await transaction
    .update(executions)
    .set({ state: 'confirmed', attempts: execution.attempts + 1, paypalResourceIds: { order: payment.orderId, capture: payment.captureId }, updatedAt: now })
    .where(eq(executions.id, executionId))
  await markExecutionSent(transaction, executionId, now)
  return { ok: true }
}

export type StoredExecution = {
  readonly id: string
  readonly rentalId: string
  // Absent for the rental fee, which comes before any hold.
  readonly holdId: string | null
  readonly action: string
  readonly state: 'pending' | 'submitted' | 'confirmed' | 'failed'
  readonly idempotencyKey: string
  readonly orderId: string | undefined
  // The PayPal authorization a release voids.
  readonly authorizationId: string | undefined
}

export async function findExecution(transaction: Transaction, executionId: string): Promise<StoredExecution | undefined> {
  const [row] = await transaction
    .select({ id: executions.id, rentalId: executions.rentalId, holdId: executions.holdId, action: executions.action, state: executions.state, idempotencyKey: executions.idempotencyKey, resources: executions.paypalResourceIds })
    .from(executions)
    .where(eq(executions.id, executionId))
  if (row === undefined) return undefined
  const { resources, ...execution } = row
  return { ...execution, orderId: resources['order'], authorizationId: resources['authorization'] }
}

// The execution's outbox message reached its queue, or is no longer needed. Other messages of the rental wait on.
export async function markExecutionSent(transaction: Transaction, executionId: string, now: Date): Promise<void> {
  await transaction.update(outbox).set({ state: 'sent', sentAt: now }).where(and(eq(outbox.state, 'pending'), sql`${outbox.payload} ->> 'executionId' = ${executionId}`))
}

// An execution PayPal refused for good, such as an order the renter never approved. Nothing is retried.
export async function failExecution(transaction: Transaction, executionId: string, reason: string, now: Date): Promise<void> {
  await transaction
    .update(executions)
    .set({ state: 'failed', lastError: reason, attempts: sql`${executions.attempts} + 1`, updatedAt: now })
    .where(and(eq(executions.id, executionId), sql`${executions.state} <> 'confirmed'`))
}
