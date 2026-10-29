import 'server-only'
import { extensionMaxDays, inShop, openExtension, rentalExtensionsOf, rentalHold, renterView } from '@hold/db'
import { EXTENSION_LIMITS, shopTimeText } from '@hold/domain'
import type { RentalState } from '@hold/domain'
import type { PayPalCheckout } from '@/features/renter/paypal-sdk'
import { paypalCheckout } from './paypal-checkout'
import { renterAccess } from './renter-access'
import { getServices } from './services'

// What the renter's page for more days reads through their link (architecture.md section 6.14). Any link to the rental
// may look; only one carrying extend may ask and pay.

export type ExtensionQuoteView = { readonly extraDays: number; readonly feeCents: number; readonly endsAt: Date }
export type PaidExtension = { readonly id: string; readonly orderId: string | null; readonly extraDays: number; readonly amountCents: number; readonly toEndsAt: Date; readonly state: 'paid' | 'capturing' | 'failed' }

export type ExtensionData = {
  readonly shopName: string
  readonly timeZone: string
  readonly currency: string
  readonly state: RentalState
  readonly simulated: boolean
  readonly canAct: boolean
  readonly endsAt: Date
  // The end the form starts at: a day after the current end, on the shop's clock, as the form takes it.
  readonly suggestedEnd: string
  readonly maxDays: number
  // The latest end the hold can cover, with time to check the return and charge a claim; none with no hold.
  readonly latestEnd: Date | null
  readonly holdCents: number | null
  readonly quote: ExtensionQuoteView | null
  readonly extensions: readonly PaidExtension[]
  readonly checkout: PayPalCheckout | undefined
}

export type ExtensionPage = { readonly ok: true; readonly data: ExtensionData } | { readonly ok: false; readonly failure: 'link_invalid' | 'scope' | 'rate_limited' }

const DAY = 86_400_000

export async function extensionPage(token: string): Promise<ExtensionPage> {
  const now = new Date()
  const access = await renterAccess(token, 'view', now)
  if (!access.ok) return access
  const { database } = await getServices()
  const { rentalId, shopId } = access.link
  const loaded = await inShop(database, { role: 'hold_app', shopId }, async (transaction) => ({
    view: await renterView(transaction, rentalId, now),
    maxDays: await extensionMaxDays(transaction),
    open: await openExtension(transaction, rentalId),
    all: await rentalExtensionsOf(transaction, rentalId),
    hold: await rentalHold(transaction, rentalId),
  }))
  const { view, hold } = loaded
  if (view === undefined) return { ok: false, failure: 'link_invalid' }
  const quote = loaded.open !== undefined && loaded.open.state !== 'capturing' ? { extraDays: loaded.open.extraDays, feeCents: loaded.open.amountCents, endsAt: loaded.open.toEndsAt } : null
  return {
    ok: true,
    data: {
      shopName: view.shopName,
      timeZone: view.timeZone,
      currency: view.currency,
      state: view.state,
      simulated: view.simulated,
      canAct: access.link.scopes.includes('extend'),
      endsAt: view.endsAt,
      suggestedEnd: shopTimeText(view.timeZone, new Date(view.endsAt.getTime() + DAY)),
      maxDays: loaded.maxDays,
      latestEnd: hold?.validUntil == null ? null : new Date(hold.validUntil.getTime() - EXTENSION_LIMITS.returnToCaptureDays * DAY),
      holdCents: hold?.reservedCents ?? null,
      quote,
      extensions: loaded.all.flatMap((each) => (each.state === 'paid' || each.state === 'capturing' || each.state === 'failed' ? [{ id: each.id, orderId: each.paypalOrderId, extraDays: each.extraDays, amountCents: each.amountCents, toEndsAt: each.toEndsAt, state: each.state }] : [])),
      checkout: quote === null ? undefined : await paypalCheckout(shopId),
    },
  }
}
