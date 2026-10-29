import { beginExtensionCapture, confirmExtensionCapture, failExtensionCapture } from '@hold/db'
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

// Throws while PayPal cannot be reached, so the queue tries again. When PayPal refuses, nothing was taken and the
// rental's old end comes back.
export async function captureExtension(dependencies: SettleDependencies, shopId: string, execution: Pick<StoredExecution, 'id' | 'orderId' | 'idempotencyKey'>, paypal: PayPalHolds): Promise<ExecutionOutcome> {
  const now = dependencies.now()
  const refused = async (reason: string) => {
    await inWorkerShop(dependencies, shopId, (transaction) => failExtensionCapture(transaction, execution.id, reason, now))
    return 'failed' as const
  }
  if (execution.orderId === undefined) return refused('No order.')
  const captured = await paypal.captureFeeOrder({ orderId: execution.orderId, idempotencyKey: execution.idempotencyKey })
  if (!captured.ok) {
    if (TRANSIENT.has(captured.error.kind)) throw new PayPalUnavailable(captured.error.kind)
    return refused(captured.error.kind)
  }
  const confirmed = await inWorkerShop(dependencies, shopId, (transaction) => confirmExtensionCapture(transaction, execution.id, captured.value, now))
  return confirmed.ok ? 'confirmed' : refused(confirmed.reason)
}
