import { saveSettlementResource, mayExecuteSettlement, confirmClaimRefund, settlementWork } from '@hold/db'
import { money } from '@hold/domain'
import type { PayPalHolds } from '@hold/paypal'
import type { SettleDependencies } from './dependencies.ts'
import { PayPalUnavailable } from './dependencies.ts'
import { inWorkerShop } from './execution-queue.ts'
export async function refundApprovedClaim(dependencies: SettleDependencies, shopId: string, executionId: string, paypal: PayPalHolds) {
  if (!await inWorkerShop(dependencies, shopId, (transaction) => mayExecuteSettlement(transaction, executionId))) return 'failed' as const
  const work = await inWorkerShop(dependencies, shopId, (transaction) => settlementWork(transaction, executionId))
  const captureId = work?.execution.paypalResourceIds['capture']
  if (work === undefined || captureId === undefined || work.execution.amountCents === null || work.execution.currency === null) return 'nothing_to_do' as const
  const refundId = work.execution.paypalResourceIds['refund']
  const read = refundId === undefined ? await paypal.refundCapture({ captureId, amount: money(work.execution.amountCents, work.execution.currency), idempotencyKey: work.execution.idempotencyKey }) : await paypal.readRefund(refundId, captureId)
  if (!read.ok) throw new PayPalUnavailable(read.error.kind)
  await inWorkerShop(dependencies, shopId, (transaction) => saveSettlementResource(transaction, executionId, 'refund', read.value.refundId, dependencies.now()))
  const confirmed = await inWorkerShop(dependencies, shopId, (transaction) => confirmClaimRefund(transaction, executionId, read.value, dependencies.now()))
  return confirmed ? 'confirmed' as const : 'waiting' as const
}
