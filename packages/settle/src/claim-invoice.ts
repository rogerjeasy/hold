import { createHash } from 'node:crypto'
import { claimInvoiceWork, confirmClaimInvoiced } from '@hold/db'
import { money } from '@hold/domain'
import type { PayPalHolds } from '@hold/paypal'
import { PayPalUnavailable } from './dependencies.ts'
import type { SettleDependencies } from './dependencies.ts'
import { inWorkerShop } from './execution-queue.ts'

export async function invoiceApprovedClaim(dependencies: SettleDependencies, shopId: string, executionId: string, paypal: PayPalHolds) {
  const work = await inWorkerShop(dependencies, shopId, (transaction) => claimInvoiceWork(transaction, executionId))
  if (work === undefined) return 'nothing_to_do' as const
  const fallback = work.execution.paypalResourceIds['purpose'] === 'capture_failed'
  let authorization = fallback ? await paypal.readAuthorization(work.authorization.paypalAuthorizationId) : null
  if (authorization !== null && (!authorization.ok || authorization.value.status === 'captured')) throw new PayPalUnavailable('unexpected_response')
  const invoice = await paypal.invoiceClaim({ invoiceNumber: `H${createHash('sha256').update(work.execution.idempotencyKey).digest('hex').slice(0, 24)}`, claimReference: work.bill.claimId, email: work.email, amount: money(work.bill.amountCents, work.bill.currency), description: work.description, idempotencyKey: work.execution.idempotencyKey })
  if (!invoice.ok) throw new PayPalUnavailable(invoice.error.kind)
  if (authorization?.ok === true && !['voided', 'expired'].includes(authorization.value.status)) {
    const released = await paypal.releaseHold({ authorizationId: work.authorization.paypalAuthorizationId, idempotencyKey: `${work.execution.idempotencyKey}-release` })
    if (!released.ok && released.error.kind !== 'hold_voided' && released.error.kind !== 'hold_expired') throw new PayPalUnavailable(released.error.kind)
    authorization = await paypal.readAuthorization(work.authorization.paypalAuthorizationId)
    if (!authorization.ok) throw new PayPalUnavailable(authorization.error.kind)
  }
  const confirmed = await inWorkerShop(dependencies, shopId, (transaction) => confirmClaimInvoiced(transaction, executionId, invoice.value, authorization?.ok === true ? authorization.value : null, dependencies.now()))
  if (!confirmed) throw new PayPalUnavailable('unexpected_response')
  return 'confirmed' as const
}
