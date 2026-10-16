import 'server-only'
import { money } from '@hold/domain'
import { itemsStillFree, renterView, saveFeeOrder } from '@hold/db'
import { requestFeeCapture } from '@hold/settle'
import type { RenterLink } from '@hold/db'
import { getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import { Refusal } from './action'
import { paypalForShop } from './paypal-for-shop'
import type { InLinkShop } from './renter-access'
import { renterUrl } from './renter-links'
import { getServices } from './services'

// The rental fee, from the renter's link to PayPal and back (architecture.md sections 7.6 and 11.1). The amount is the
// one stored on the rental. Each step can be repeated: an order the renter is approving is reused, and a capture is
// keyed by the rental and its order. The worker calls PayPal to capture; this only records the execution and sends it.

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

// The renter is back from PayPal. Once PayPal shows the order approved, the capture is recorded and handed to the
// worker, which calls PayPal. The renter's page then shows the rental booked as soon as the worker has read it back.
export async function confirmFeePayment(link: RenterLink, inLinkShop: InLinkShop, orderId: string): Promise<{ readonly state: 'booked' | 'capturing' } | Refusal> {
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

  if (view.state === 'booked') return { state: 'booked' }
  const { settle } = await getServices()
  try {
    const requested = await requestFeeCapture(settle, link.shopId, link.rentalId)
    if (!requested.ok) return new Refusal(requested.reason)
  } catch {
    // The execution and its outbox message are recorded; the relay hands it to the worker if sending failed.
  }
  const after = await inLinkShop((transaction) => renterView(transaction, link.rentalId, new Date()))
  return { state: after?.state === 'booked' ? 'booked' : 'capturing' }
}
