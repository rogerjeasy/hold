import { beginFeeCapture, confirmFeeCapture, failExecution } from '@hold/db'
import type { StoredExecution } from '@hold/db'
import type { PayPalHolds } from '@hold/paypal'
import { PayPalUnavailable, TRANSIENT } from './dependencies.ts'
import type { RequestDependencies, SettleDependencies } from './dependencies.ts'
import { inWorkerShop, sendExecution } from './execution-queue.ts'
import type { ExecutionOutcome, RequestResult } from './execution-queue.ts'

// Capturing the rental fee (architecture.md section 7.6). Whoever asks only records the execution and queues it; the
// worker calls PayPal with the execution's key and records what PayPal reads back.

// Records the capture of an approved fee and sends it to the worker at once. Asked again, it sends the same execution.
export async function requestFeeCapture(dependencies: RequestDependencies, shopId: string, rentalId: string): Promise<RequestResult> {
  const begun = await inWorkerShop(dependencies, shopId, (transaction) => beginFeeCapture(transaction, rentalId, dependencies.now()))
  if (!begun.ok) return begun
  await sendExecution(dependencies, shopId, rentalId, begun.execution.id)
  return { ok: true, executionId: begun.execution.id }
}

// Throws while PayPal cannot be reached, so the queue tries again; records PayPal's refusal otherwise.
export async function captureFee(dependencies: SettleDependencies, shopId: string, execution: Pick<StoredExecution, 'id' | 'orderId' | 'idempotencyKey'>, paypal: PayPalHolds): Promise<ExecutionOutcome> {
  const now = dependencies.now()
  if (execution.orderId === undefined) {
    await inWorkerShop(dependencies, shopId, (transaction) => failExecution(transaction, execution.id, 'No order.', now))
    return 'failed'
  }
  const captured = await paypal.captureFeeOrder({ orderId: execution.orderId, idempotencyKey: execution.idempotencyKey })
  if (!captured.ok) {
    if (TRANSIENT.has(captured.error.kind)) throw new PayPalUnavailable(captured.error.kind)
    await inWorkerShop(dependencies, shopId, (transaction) => failExecution(transaction, execution.id, captured.error.kind, now))
    return 'failed'
  }
  const confirmed = await inWorkerShop(dependencies, shopId, (transaction) => confirmFeeCapture(transaction, execution.id, captured.value, now))
  return confirmed.ok ? 'confirmed' : 'failed'
}

export type EventProcessing = 'applied' | 'ignored' | 'failed'

// An event about a fee order. Nothing in the event is believed: the order is read back from PayPal.
export async function applyFeeEvent(dependencies: SettleDependencies, shopId: string, paypal: PayPalHolds, event: { readonly type: string; readonly orderId: string }, rentalId: string): Promise<EventProcessing> {
  const now = dependencies.now()
  if (event.type === 'CHECKOUT.ORDER.APPROVED') {
    // The renter approved the fee but may never have come back to Hold. PayPal's record decides.
    const order = await paypal.readHoldOrder(event.orderId)
    if (!order.ok) throw new PayPalUnavailable(order.error.kind)
    if (order.value.status !== 'approved') return 'ignored'
    const begun = await inWorkerShop(dependencies, shopId, (transaction) => beginFeeCapture(transaction, rentalId, now))
    if (!begun.ok) return 'ignored'
    return (await captureFee(dependencies, shopId, begun.execution, paypal)) === 'failed' ? 'failed' : 'applied'
  }
  if (event.type !== 'PAYMENT.CAPTURE.COMPLETED') return 'ignored'
  // PayPal captured the fee. The order is read back for who paid and how much.
  const payment = await paypal.readFeePayment(event.orderId)
  if (!payment.ok) {
    if (TRANSIENT.has(payment.error.kind)) throw new PayPalUnavailable(payment.error.kind)
    return 'ignored'
  }
  const confirmed = await inWorkerShop(dependencies, shopId, async (transaction) => {
    const begun = await beginFeeCapture(transaction, rentalId, now, { confirming: true })
    return begun.ok ? confirmFeeCapture(transaction, begun.execution.id, payment.value, now) : begun
  })
  return confirmed.ok ? 'applied' : 'failed'
}
