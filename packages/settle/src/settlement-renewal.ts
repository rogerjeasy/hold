import { confirmSettlementRenewal, failSettlementRenewal, settlementWork } from '@hold/db'
import type { StoredExecution } from '@hold/db'
import { money } from '@hold/domain'
import type { PayPalHolds } from '@hold/paypal'
import { PayPalUnavailable, TRANSIENT } from './dependencies.ts'
import type { SettleDependencies } from './dependencies.ts'
import { inWorkerShop } from './execution-queue.ts'

export async function renewForSettlement(dependencies: SettleDependencies, shopId: string, execution: StoredExecution, paypal: PayPalHolds) {
  const work = await inWorkerShop(dependencies, shopId, (transaction) => settlementWork(transaction, execution.id))
  if (work === undefined) return 'nothing_to_do' as const
  if (work.execution.state === 'confirmed') return 'confirmed' as const
  if (work.execution.state === 'failed') return 'failed' as const
  // A walk-in's authorization also carried the fee, already captured from it, so the renewal names what is still
  // held: one with no amount asks for the whole authorization, which PayPal refuses (tech-stack.md section 16, item 3).
  const stillHeld = work.execution.amountCents !== null && work.execution.currency !== null && work.execution.amountCents < work.authorization.amountCents ? { amount: money(work.execution.amountCents, work.execution.currency) } : {}
  const renewed = await paypal.renewHold({ authorizationId: work.execution.paypalResourceIds['authorization'] ?? '', idempotencyKey: execution.idempotencyKey, ...stillHeld })
  if (!renewed.ok) {
    if (TRANSIENT.has(renewed.error.kind)) throw new PayPalUnavailable(renewed.error.kind)
    await inWorkerShop(dependencies, shopId, (transaction) => failSettlementRenewal(transaction, execution.id, renewed.error.kind, dependencies.now()))
    return 'failed' as const
  }
  if (!await inWorkerShop(dependencies, shopId, (transaction) => confirmSettlementRenewal(transaction, execution.id, renewed.value, dependencies.now()))) throw new PayPalUnavailable('unexpected_response')
  return 'confirmed' as const
}
