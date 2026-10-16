import { failExecution, findExecution } from '@hold/db'
import type { SettleDependencies } from './dependencies.ts'
import { inWorkerShop } from './execution-queue.ts'
import type { ExecutionOutcome } from './execution-queue.ts'
import { captureFee } from './fee-capture.ts'
import { authorizeHold, ensureUpkeep, releaseReplaced } from './hold-placement.ts'
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
  if (execution.action === 'fee_capture') return captureFee(dependencies, shopId, execution, account.paypal)
  if (execution.action === 'authorize') return authorizeHold(dependencies, shopId, execution, account.paypal)
  if (execution.action === 'release') return releaseReplaced(dependencies, shopId, execution, account.paypal)
  return 'nothing_to_do'
}
