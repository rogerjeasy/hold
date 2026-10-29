import 'server-only'
import { inShop, openExtension, quoteExtension, rentalExtensionsOf, renterView, saveExtensionOrder } from '@hold/db'
import type { RenterLink } from '@hold/db'
import { atShopTime } from '@hold/domain'
import type { ExtensionProblem } from '@hold/domain'
import { requestExtensionCapture } from '@hold/settle'
import { getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import { Refusal } from './action'
import { paypalForShop } from './paypal-for-shop'
import type { InLinkShop } from './renter-access'
import { renterUrl } from './renter-links'
import { getServices } from './services'

// More days, from the renter's link to PayPal and back (architecture.md section 6.14). Hold prices them; the renter
// approves the extension's own PayPal order; the worker captures it. Nothing here takes an amount from the renter, and
// nothing touches the hold.

// A refusal names what the renter needs to act on it: the latest end the hold covers, when the item is needed, or the
// most days the shop allows, as "kind:value".
export function extensionRefusal(problem: ExtensionProblem | { readonly kind: 'not_found' }): Refusal {
  if (problem.kind === 'beyond_hold') return new Refusal(`beyond_hold:${problem.latest.toISOString()}`)
  if (problem.kind === 'not_free') return new Refusal(`not_free:${problem.neededFrom.toISOString()}`)
  if (problem.kind === 'too_many_days') return new Refusal(`too_many_days:${String(problem.maxDays)}`)
  return new Refusal(problem.kind)
}

export type QuotedExtension = { readonly extraDays: number; readonly feeCents: number; readonly currency: string; readonly endsAt: string }

// The new end comes as the shop's clock shows it, as the renter's form sends it.
export async function quoteRenterExtension(link: RenterLink, inLinkShop: InLinkShop, localEnd: string, askedThrough: 'link' | 'assistant'): Promise<QuotedExtension | Refusal> {
  const now = new Date()
  const view = await inLinkShop((transaction) => renterView(transaction, link.rentalId, now))
  if (view === undefined) return new Refusal('not_found')
  const endsAt = atShopTime(view.timeZone, localEnd)
  if (endsAt === undefined) return new Refusal('not_later')
  const quoted = await inLinkShop((transaction) => quoteExtension(transaction, link.rentalId, endsAt, askedThrough, now))
  if (!quoted.ok) return extensionRefusal(quoted.problem)
  return { extraDays: quoted.terms.extraDays, feeCents: quoted.terms.fee.cents, currency: quoted.terms.fee.currency, endsAt: quoted.terms.endsAt.toISOString() }
}

export type StartedExtension = { readonly approvalUrl: string; readonly orderId: string; readonly returnUrl: string }

// The PayPal order for the quoted days, for the amount the quote stored. A second visit reuses the order the person is
// approving.
export async function startExtensionPayment(link: RenterLink, inLinkShop: InLinkShop, token: string, language: Locale): Promise<StartedExtension | Refusal> {
  const loaded = await inLinkShop(async (transaction) => ({ extension: await openExtension(transaction, link.rentalId), view: await renterView(transaction, link.rentalId, new Date()) }))
  const { extension, view } = loaded
  if (view === undefined) return new Refusal('not_found')
  if (extension === undefined || extension.state === 'capturing') return new Refusal('no_quote')
  const paypal = await inLinkShop((transaction) => paypalForShop(transaction, link.shopId))
  if (paypal === undefined) return new Refusal('paypal_not_connected')
  const url = await renterUrl(token, language)
  const started = (orderId: string, approvalUrl: string): StartedExtension => ({ approvalUrl, orderId, returnUrl: `${url}/extended?token=${encodeURIComponent(orderId)}` })
  if (extension.paypalOrderId !== null) {
    const order = await paypal.readHoldOrder(extension.paypalOrderId)
    if (order.ok && order.value.status === 'awaiting_approval' && order.value.approvalUrl !== undefined) return started(extension.paypalOrderId, order.value.approvalUrl)
    return new Refusal('no_quote')
  }
  // What the renter reads in PayPal, in their language. PayPal takes up to 127 characters.
  const t = await getTranslations({ locale: language, namespace: 'extension' })
  const created = await paypal.createFeeOrder({
    amount: { cents: extension.amountCents, currency: extension.currency },
    rentalReference: link.rentalId,
    description: t('orderDescription', { shop: view.shopName, days: extension.extraDays }).slice(0, 127),
    returnUrl: `${url}/extended`,
    cancelUrl: `${url}/extend`,
    idempotencyKey: `extension-order-${extension.id}`,
  })
  if (!created.ok || created.value.approvalUrl === undefined) return new Refusal('paypal_unavailable')
  const { orderId, approvalUrl } = created.value
  await inLinkShop((transaction) => saveExtensionOrder(transaction, extension.id, orderId))
  return started(orderId, approvalUrl)
}

// The renter is back from PayPal. Once PayPal shows the order approved, the capture is recorded, the new end applied,
// and the capture handed to the worker.
export async function confirmExtensionPayment(link: RenterLink, inLinkShop: InLinkShop, orderId: string): Promise<{ readonly state: 'paid' | 'capturing' } | Refusal> {
  const ours = (await inLinkShop((transaction) => rentalExtensionsOf(transaction, link.rentalId))).find((each) => each.paypalOrderId === orderId)
  // Only an order this rental started: a renter cannot pay for one rental's days with another's order.
  if (ours === undefined) return new Refusal('order_mismatch')
  if (ours.state === 'paid') return { state: 'paid' }
  const paypal = await inLinkShop((transaction) => paypalForShop(transaction, link.shopId))
  if (paypal === undefined) return new Refusal('paypal_not_connected')
  const order = await paypal.readHoldOrder(orderId)
  if (!order.ok) return new Refusal('paypal_unavailable')
  if (order.value.status === 'awaiting_approval') return new Refusal('not_approved')
  const { settle, database } = await getServices()
  try {
    const requested = await requestExtensionCapture(settle, link.shopId, link.rentalId, orderId)
    if (!requested.ok) return new Refusal(requested.reason)
  } catch {
    // The execution and its outbox message are recorded; the relay hands it to the worker if sending failed.
  }
  const after = (await inShop(database, { role: 'hold_app', shopId: link.shopId }, (transaction) => rentalExtensionsOf(transaction, link.rentalId))).find((each) => each.paypalOrderId === orderId)
  return { state: after?.state === 'paid' ? 'paid' : 'capturing' }
}
