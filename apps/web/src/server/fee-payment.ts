import 'server-only'
import { money } from '@hold/domain'
import { beginFeeCapture, confirmFeeCapture, itemsStillFree, renterView, saveFeeOrder } from '@hold/db'
import type { RenterLink } from '@hold/db'
import { getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import { Refusal } from './action'
import { paypalForShop } from './paypal-for-shop'
import type { InLinkShop } from './renter-access'
import { renterUrl } from './renter-links'

// The rental fee, from the renter's link to PayPal and back (architecture.md sections 7.6 and 11.1). The amount is the
// one stored on the rental. Each step can be repeated: an order the renter is approving is reused, and a capture is
// keyed by the rental and its order. Until the worker runs executions, this request finishes the one it began; its
// outbox message lets the worker finish it instead if this request does not.

const FAILURE_REASON: Readonly<Record<string, string>> = { order_not_approved: 'not_approved', declined: 'declined' }

export async function startFeePayment(link: RenterLink, inLinkShop: InLinkShop, token: string, language: Locale): Promise<{ readonly approvalUrl: string } | Refusal> {
  const now = new Date()
  const view = await inLinkShop((transaction) => renterView(transaction, link.rentalId, now))
  if (view === undefined) return new Refusal('not_found')
  if (view.state !== 'pending_payment') return new Refusal('not_pending')
  if (view.paymentLapsed && !(await inLinkShop((transaction) => itemsStillFree(transaction, link.rentalId, now)))) return new Refusal('payment_lapsed')
  const paypal = await inLinkShop((transaction) => paypalForShop(transaction, link.shopId))
  if (paypal === undefined) return new Refusal('paypal_not_connected')

  if (view.feeOrderId !== null) {
    const order = await paypal.readHoldOrder(view.feeOrderId)
    if (order.ok && order.value.status === 'awaiting_approval' && order.value.approvalUrl !== undefined) return { approvalUrl: order.value.approvalUrl }
  }
  const url = await renterUrl(token, language)
  // What the renter reads in PayPal, in their language. PayPal takes up to 127 characters.
  const t = await getTranslations({ locale: language, namespace: 'renter' })
  const created = await paypal.createFeeOrder({
    amount: money(view.feeCents, view.currency),
    rentalReference: link.rentalId,
    description: t('orderDescription', { shop: view.shopName, items: view.lines.map((line) => `${String(line.count)} × ${line.name}`).join(', '), days: view.days }).slice(0, 127),
    returnUrl: `${url}/paid`,
    cancelUrl: url,
    // A first order, or a fresh one after an order that can no longer be approved.
    idempotencyKey: view.feeOrderId === null ? `fee-order-${link.rentalId}` : `fee-order-${link.rentalId}-after-${view.feeOrderId}`,
  })
  if (!created.ok || created.value.approvalUrl === undefined) return new Refusal('paypal_unavailable')
  const { orderId, approvalUrl } = created.value
  await inLinkShop((transaction) => saveFeeOrder(transaction, link.rentalId, orderId))
  return { approvalUrl }
}

export async function confirmFeePayment(link: RenterLink, inLinkShop: InLinkShop, orderId: string): Promise<{ readonly state: 'booked' } | Refusal> {
  const now = new Date()
  const view = await inLinkShop((transaction) => renterView(transaction, link.rentalId, now))
  if (view === undefined) return new Refusal('not_found')
  // Only the order this rental started: a renter cannot pay one rental with another's order.
  if (view.feeOrderId !== orderId) return new Refusal('order_mismatch')
  const paypal = await inLinkShop((transaction) => paypalForShop(transaction, link.shopId))
  if (paypal === undefined) return new Refusal('paypal_not_connected')

  // Nothing is recorded for an order the renter has not approved.
  const order = await paypal.readHoldOrder(orderId)
  if (!order.ok) return new Refusal('paypal_unavailable')
  if (order.value.status === 'awaiting_approval') return new Refusal('not_approved')

  const begun = await inLinkShop((transaction) => beginFeeCapture(transaction, link.rentalId, now))
  if (!begun.ok) return new Refusal(begun.reason)
  const captured = await paypal.captureFeeOrder({ orderId, idempotencyKey: begun.execution.idempotencyKey })
  if (!captured.ok) return new Refusal(FAILURE_REASON[captured.error.kind] ?? 'paypal_unavailable')
  const confirmed = await inLinkShop((transaction) => confirmFeeCapture(transaction, begun.execution.id, captured.value, now))
  return confirmed.ok ? { state: 'booked' } : new Refusal(confirmed.reason)
}
