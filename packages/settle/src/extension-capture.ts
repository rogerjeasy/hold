import { beginExtensionCapture, confirmExtensionCapture, EXECUTIONS_QUEUE, failExtensionCapture, flagExtensionCapture, flagLateExtensionPayment, pendExtensionCapture } from '@hold/db'
import type { StoredExecution } from '@hold/db'
import type { PayPalHolds } from '@hold/paypal'
import { PayPalUnavailable, TRANSIENT } from './dependencies.ts'
import type { RequestDependencies, SettleDependencies } from './dependencies.ts'
import { inWorkerShop, sendExecution } from './execution-queue.ts'
import type { ExecutionOutcome } from './execution-queue.ts'

// Capturing more days a renter paid for from their phone (architecture.md section 6.14), from the extension's own PayPal
// order, like the rental fee. The hold is never touched. Whoever asks records the execution and queues it; the worker
// calls PayPal with the execution's key and records what PayPal reads back.

export async function requestExtensionCapture(dependencies: RequestDependencies, shopId: string, rentalId: string, orderId: string): Promise<{ readonly ok: true; readonly executionId: string } | { readonly ok: false; readonly reason: string }> {
  const begun = await inWorkerShop(dependencies, shopId, (transaction) => beginExtensionCapture(transaction, rentalId, orderId, dependencies.now()))
  if (!begun.ok) return begun
  await sendExecution(dependencies, shopId, rentalId, begun.execution.id)
  return { ok: true, executionId: begun.execution.id }
}

// PayPal has nothing for the renter: the capture was refused, or never went through.
const NOT_TAKEN: ReadonlySet<string> = new Set(['declined', 'failed', 'refunded'])

// Throws while PayPal cannot be reached, so the queue tries again. When PayPal refuses, nothing was taken and the
// rental's old end comes back. A capture PayPal reports as pending is read back, never made again: when PayPal's event
// about it comes, and at its deadline, when Hold stops waiting and the old end comes back.
export async function captureExtension(dependencies: SettleDependencies, shopId: string, execution: Pick<StoredExecution, 'id' | 'rentalId' | 'orderId' | 'idempotencyKey' | 'captureId'>, paypal: PayPalHolds): Promise<ExecutionOutcome> {
  const now = dependencies.now()
  const refused = async (reason: string) => {
    await inWorkerShop(dependencies, shopId, (transaction) => failExtensionCapture(transaction, execution.id, reason, now))
    return 'failed' as const
  }
  if (execution.orderId === undefined) return refused('No order.')
  const captured = execution.captureId !== undefined ? await paypal.readFeePayment(execution.orderId) : await paypal.captureFeeOrder({ orderId: execution.orderId, idempotencyKey: execution.idempotencyKey })
  // Not yet settled by PayPal: wait for its event, or give up at the deadline.
  const wait = async (captureId: string): Promise<ExecutionOutcome> => {
    const pending = await inWorkerShop(dependencies, shopId, (transaction) => pendExtensionCapture(transaction, execution.id, captureId, now))
    if (pending === undefined) return 'nothing_to_do'
    if (now >= pending.deadline) return refused('payment_expired')
    const name = `extension-due-${execution.id}`
    await dependencies.scheduler.at(name, pending.deadline, { queue: EXECUTIONS_QUEUE, group: pending.rentalId, deduplicationId: name, body: { shopId, executionId: execution.id } })
    return 'waiting'
  }
  if (!captured.ok) {
    if (TRANSIENT.has(captured.error.kind)) throw new PayPalUnavailable(captured.error.kind)
    // PayPal took the capture before; failing to read it now is no answer, so the deadline still decides.
    return execution.captureId === undefined ? refused(captured.error.kind) : wait(execution.captureId)
  }
  const payment = captured.value
  const confirmed = await inWorkerShop(dependencies, shopId, (transaction) => confirmExtensionCapture(transaction, execution.id, payment, now))
  if (confirmed.ok) return 'confirmed'
  // Money moved, but not the quoted amount: never undone quietly. A person is asked to look.
  if (confirmed.reason === 'amount_mismatch') {
    await inWorkerShop(dependencies, shopId, (transaction) => flagExtensionCapture(transaction, execution.id, payment, now))
    return 'failed'
  }
  if (confirmed.reason === 'not_found') return refused('not_found')
  return NOT_TAKEN.has(payment.status) ? refused(payment.status) : wait(payment.captureId)
}

// PayPal's event names a capture Hold stopped waiting for. Nothing in the event is believed: the order is read back, and
// only a capture PayPal shows completed is put before a person.
export async function checkLateExtensionPayment(dependencies: SettleDependencies, shopId: string, late: { readonly executionId: string; readonly orderId: string }, paypal: PayPalHolds): Promise<'applied' | 'ignored'> {
  const read = await paypal.readFeePayment(late.orderId)
  if (!read.ok) {
    if (TRANSIENT.has(read.error.kind)) throw new PayPalUnavailable(read.error.kind)
    return 'ignored'
  }
  if (read.value.status !== 'completed') return 'ignored'
  await inWorkerShop(dependencies, shopId, (transaction) => flagLateExtensionPayment(transaction, late.executionId, read.value, dependencies.now()))
  return 'applied'
}
