import { confirmSettlementRenewal, failSettlementRenewal, settlementWork } from '@hold/db'
import type { StoredExecution } from '@hold/db'
import type { PayPalHolds } from '@hold/paypal'
import { PayPalUnavailable, TRANSIENT } from './dependencies.ts'
import type { SettleDependencies } from './dependencies.ts'
import { inWorkerShop } from './execution-queue.ts'

export async function renewForSettlement(dependencies: SettleDependencies, shopId: string, execution: StoredExecution, paypal: PayPalHolds) {
  const work = await inWorkerShop(dependencies, shopId, (transaction) => settlementWork(transaction, execution.id))
  if (work === undefined) return 'nothing_to_do' as const
  if (work.execution.state === 'confirmed') return 'confirmed' as const
  if (work.execution.state === 'failed') return 'failed' as const
  const renewed = await paypal.renewHold({ authorizationId: work.execution.paypalResourceIds['authorization'] ?? '', idempotencyKey: execution.idempotencyKey })
  if (!renewed.ok) {
    if (TRANSIENT.has(renewed.error.kind)) throw new PayPalUnavailable(renewed.error.kind)
    await inWorkerShop(dependencies, shopId, (transaction) => failSettlementRenewal(transaction, execution.id, renewed.error.kind, dependencies.now()))
    return 'failed' as const
  }
  if (!await inWorkerShop(dependencies, shopId, (transaction) => confirmSettlementRenewal(transaction, execution.id, renewed.value, dependencies.now()))) throw new PayPalUnavailable('unexpected_response')
  return 'confirmed' as const
}
