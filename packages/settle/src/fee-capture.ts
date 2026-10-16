import { and, eq } from 'drizzle-orm'
import { beginFeeCapture, confirmFeeCapture, EXECUTIONS_QUEUE, failExecution, feeExecution, inShop, outbox } from '@hold/db'
import { PayPalUnavailable, TRANSIENT } from './dependencies.ts'
import type { SettleDependencies } from './dependencies.ts'
import { shopPayPal } from './shop-paypal.ts'

// Capturing the rental fee (architecture.md section 7.6). Whoever asks only records the execution and queues it; the
// worker calls PayPal with the execution's key and records what PayPal reads back.

const scope = (dependencies: SettleDependencies, shopId: string) => ({ role: dependencies.role ?? 'hold_worker', shopId }) as const

export const executionMessage = (shopId: string, rentalId: string, executionId: string) => ({
  queue: EXECUTIONS_QUEUE,
  group: rentalId,
  deduplicationId: `execution-${executionId}`,
  body: { shopId, executionId },
})

export type RequestResult = { readonly ok: true; readonly executionId: string } | { readonly ok: false; readonly reason: string }

// Records the capture of an approved fee and sends it to the worker at once. Its outbox message is the fallback if
// the send fails. Asked again, it sends the same execution, which the queue takes once.
export async function requestFeeCapture(dependencies: SettleDependencies, shopId: string, rentalId: string): Promise<RequestResult> {
  const now = dependencies.now()
  const begun = await inShop(dependencies.database, scope(dependencies, shopId), (transaction) => beginFeeCapture(transaction, rentalId, now))
  if (!begun.ok) return begun
  await dependencies.send(executionMessage(shopId, rentalId, begun.execution.id))
  await inShop(dependencies.database, scope(dependencies, shopId), (transaction) =>
    transaction.update(outbox).set({ state: 'sent', sentAt: now }).where(and(eq(outbox.messageGroup, rentalId), eq(outbox.queue, EXECUTIONS_QUEUE), eq(outbox.state, 'pending'))),
  )
  return { ok: true, executionId: begun.execution.id }
}

export type ExecutionOutcome = 'confirmed' | 'failed' | 'nothing_to_do'

// Carries out one execution. Throws while PayPal cannot be reached, so the queue tries again; records PayPal's refusal
// otherwise. A confirmed or failed execution is left alone.
export async function runExecution(dependencies: SettleDependencies, message: { readonly shopId: string; readonly executionId: string }): Promise<ExecutionOutcome> {
  const { shopId, executionId } = message
  const loaded = await inShop(dependencies.database, scope(dependencies, shopId), async (transaction) => ({
    execution: await feeExecution(transaction, executionId),
    account: await shopPayPal(dependencies, transaction, shopId),
  }))
  const { execution, account } = loaded
  if (execution === undefined || execution.action !== 'fee_capture' || execution.state === 'confirmed' || execution.state === 'failed') return 'nothing_to_do'
  const now = dependencies.now()
  if (account === undefined || execution.orderId === undefined) {
    await inShop(dependencies.database, scope(dependencies, shopId), (transaction) => failExecution(transaction, executionId, 'No PayPal account or order.', now))
    return 'failed'
  }
  const captured = await account.paypal.captureFeeOrder({ orderId: execution.orderId, idempotencyKey: execution.idempotencyKey })
  if (!captured.ok) {
    if (TRANSIENT.has(captured.error.kind)) throw new PayPalUnavailable(captured.error.kind)
    await inShop(dependencies.database, scope(dependencies, shopId), (transaction) => failExecution(transaction, executionId, captured.error.kind, now))
    return 'failed'
  }
  const confirmed = await inShop(dependencies.database, scope(dependencies, shopId), (transaction) => confirmFeeCapture(transaction, executionId, captured.value, now))
  return confirmed.ok ? 'confirmed' : 'failed'
}
