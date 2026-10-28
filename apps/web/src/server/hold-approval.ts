import 'server-only'
import { money } from '@hold/domain'
import { rentalHold, renterView, saveHoldOrder } from '@hold/db'
import { holdOrderDescription } from '@hold/notify'
import { requestHoldPlacement } from '@hold/settle'
import type { RenterLink } from '@hold/db'
import type { Locale } from '@/i18n/routing'
import { Refusal } from './action'
import { paypalForShop } from './paypal-for-shop'
import type { StartedPayment } from './fee-payment'
import type { InLinkShop } from './renter-access'
import { renterUrl } from './renter-links'
import { getServices } from './services'

// The hold at pickup, from the renter's link to PayPal and back (architecture.md sections 8.2 and 8.4). Staff ask for
// it first. The amount is the hold agreed at booking, stored on the hold. The worker authorizes the order; this only
// records the execution and sends it.

export async function startHoldApproval(link: RenterLink, inLinkShop: InLinkShop, token: string, language: Locale): Promise<StartedPayment | Refusal> {
  const { hold, view } = await inLinkShop(async (transaction) => ({ hold: await rentalHold(transaction, link.rentalId), view: await renterView(transaction, link.rentalId, new Date()) }))
  if (hold === undefined || view === undefined) return new Refusal('not_requested')
  // A placed hold asks for approval only while a replacement for it waits.
  if (hold.state !== 'requested' && hold.orderId === null) return new Refusal('already_placed')
  const paypal = await inLinkShop((transaction) => paypalForShop(transaction, link.shopId))
  if (paypal === undefined) return new Refusal('paypal_not_connected')

  // An order still waiting for approval is reused, the hold's own or a replacement's. One approved and then declined
  // needs a new one.
  const url = `${await renterUrl(token, language)}/pay`
  const started = (orderId: string, approvalUrl: string): StartedPayment => ({ approvalUrl, orderId, returnUrl: `${url}?token=${encodeURIComponent(orderId)}` })
  if (hold.orderId !== null) {
    const order = await paypal.readHoldOrder(hold.orderId)
    if (order.ok && order.value.status === 'awaiting_approval' && order.value.approvalUrl !== undefined) return started(hold.orderId, order.value.approvalUrl)
  }
  const created = await paypal.createHoldOrder({
    amount: money(hold.reservedCents, hold.currency),
    rentalReference: link.rentalId,
    // What the renter reads in PayPal, in their language. The worker words a replacement the same way.
    description: holdOrderDescription(language, view.shopName),
    returnUrl: url,
    cancelUrl: url,
    idempotencyKey: hold.orderId === null ? `hold-order-${hold.id}` : `hold-order-${hold.id}-after-${hold.orderId}`,
  })
  if (!created.ok || created.value.approvalUrl === undefined) return new Refusal('paypal_unavailable')
  const { orderId, approvalUrl } = created.value
  await inLinkShop((transaction) => saveHoldOrder(transaction, link.rentalId, orderId))
  return started(orderId, approvalUrl)
}

// The renter is back from PayPal. Once PayPal shows the order approved, the authorization is recorded and handed to
// the worker. The page then shows the hold placed as soon as the worker has read it back, or why PayPal refused it.
export async function confirmHoldApproval(link: RenterLink, inLinkShop: InLinkShop, orderId: string): Promise<{ readonly state: 'placed' | 'placing' } | Refusal> {
  const hold = await inLinkShop((transaction) => rentalHold(transaction, link.rentalId))
  if (hold === undefined) return new Refusal('not_requested')
  // Nothing waits for approval: the hold, or its replacement, is placed.
  if (hold.orderId === null) return hold.state === 'placed' ? { state: 'placed' } : new Refusal('order_mismatch')
  // Only the order this hold is waiting on: a renter cannot place one rental's hold with another's order.
  if (hold.orderId !== orderId) return new Refusal('order_mismatch')
  const paypal = await inLinkShop((transaction) => paypalForShop(transaction, link.shopId))
  if (paypal === undefined) return new Refusal('paypal_not_connected')

  // Nothing is recorded for an order the renter has not approved.
  const order = await paypal.readHoldOrder(orderId)
  if (!order.ok) return new Refusal('paypal_unavailable')
  if (order.value.status === 'awaiting_approval') return new Refusal('not_approved')

  const { settle } = await getServices()
  try {
    const requested = await requestHoldPlacement(settle, link.shopId, link.rentalId)
    if (!requested.ok) return new Refusal(requested.reason)
  } catch {
    // The execution and its outbox message are recorded; the relay hands it to the worker if sending failed.
  }
  const after = await inLinkShop((transaction) => rentalHold(transaction, link.rentalId))
  if (after?.state === 'placed' && after.orderId === null) return { state: 'placed' }
  return after?.placementFailure === null || after?.placementFailure === undefined ? { state: 'placing' } : new Refusal(after.placementFailure === 'declined' ? 'declined' : 'hold_refused')
}
