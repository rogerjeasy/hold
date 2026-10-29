import { failExecution, findExecution } from '@hold/db'
import type { SettleDependencies } from './dependencies.ts'
import { inWorkerShop } from './execution-queue.ts'
import type { ExecutionOutcome } from './execution-queue.ts'
import { captureExtension } from './extension-capture.ts'
import { captureCombinedFee, captureFee } from './fee-capture.ts'
import { authorizeHold, ensureUpkeep, releaseReplaced } from './hold-placement.ts'
import { refundApprovedClaim } from './claim-refund.ts'
import { invoiceApprovedClaim } from './claim-invoice.ts'
import { renewForSettlement } from './settlement-renewal.ts'
import { settleReturn } from './return-settlement.ts'
import { shopPayPal } from './shop-paypal.ts'

// Carries out one execution from the queue. A confirmed or failed execution is left alone, except that a placed
// hold's upkeep is made again, in case making it failed after PayPal placed the hold.
export async function runExecution(dependencies: SettleDependencies, message: { readonly shopId: string; readonly executionId: string }): Promise<ExecutionOutcome> {
  const { shopId, executionId } = message
  const { execution, account } = await inWorkerShop(dependencies, shopId, async (transaction) => ({
    execution: await findExecution(transaction, executionId),
    account: await shopPayPal(dependencies, transaction, shopId),
  }))
  if (execution === undefined || execution.state === 'failed') return 'nothing_to_do'
  if (execution.state === 'confirmed') {
    if (execution.action === 'authorize' && execution.holdId !== null) await ensureUpkeep(dependencies, shopId, execution.holdId)
    return 'nothing_to_do'
  }
  if (account === undefined) {
    await inWorkerShop(dependencies, shopId, (transaction) => failExecution(transaction, executionId, 'No PayPal account.', dependencies.now()))
    return 'failed'
  }
  if (execution.action === 'fee_capture') return execution.authorizationId === undefined ? captureFee(dependencies, shopId, execution, account.paypal) : captureCombinedFee(dependencies, shopId, execution, account.paypal)
  if (execution.action === 'extension_capture') return captureExtension(dependencies, shopId, execution, account.paypal)
  if (execution.action === 'authorize') return authorizeHold(dependencies, shopId, execution, account.paypal)
  if (execution.action === 'refund') return refundApprovedClaim(dependencies, shopId, execution.id, account.paypal)
  if (execution.action === 'invoice') return invoiceApprovedClaim(dependencies, shopId, execution.id, account.paypal)
  if (execution.action === 'renew') return renewForSettlement(dependencies, shopId, execution, account.paypal)
  if (execution.action === 'capture' || (execution.action === 'release' && execution.idempotencyKey.startsWith('return-release-'))) return settleReturn(dependencies, shopId, execution, account.paypal)
  if (execution.action === 'release') return releaseReplaced(dependencies, shopId, execution, account.paypal)
  return 'nothing_to_do'
}
