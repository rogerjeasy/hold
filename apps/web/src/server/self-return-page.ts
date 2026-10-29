import 'server-only'
import { inShop, rentalHold, renterView, returnBaseline, selfReturnFor } from '@hold/db'
import type { RentalHold } from '@hold/db'
import { returnedOnTime, selfReturnStage, shopOpening } from '@hold/domain'
import type { HoldState, RentalState, SelfReturnStage, ShopOpening } from '@hold/domain'
import type { AuthorizationStatus } from '@hold/paypal'
import type { ReturnItem } from '@/features/self-return/return-capture'
import { paypalForShop } from './paypal-for-shop'
import { renterAccess } from './renter-access'
import { getServices } from './services'

// What the renter's return page reads through their link (architecture.md section 6.13). Any link to the rental may
// look; only one carrying return_item may start, photograph and send. Photographs are shown through short-lived signed
// links to their display copies.

export type PayPalReading = { readonly status: AuthorizationStatus; readonly amountCents: number; readonly checkedAt: Date }

export type SelfReturnData = {
  readonly shopName: string
  readonly simulated: boolean
  readonly canAct: boolean
  readonly stage: SelfReturnStage
  readonly rentalState: RentalState
  readonly dropPoint: string | null
  readonly opening: ShopOpening | undefined
  readonly timeZone: string
  readonly currency: string
  readonly droppedOffAt: Date | null
  readonly onTime: boolean
  readonly missingAt: Date | null
  readonly hold: { readonly reservedCents: number; readonly state: HoldState } | null
  // PayPal's own answer, read as the page opens: the hold is reserved there and nothing was taken. Null when PayPal
  // could not be asked, for a sample, or before the return is sent.
  readonly paypal: PayPalReading | null
  readonly items: readonly ReturnItem[]
}

export type SelfReturnPage = { readonly ok: true; readonly data: SelfReturnData } | { readonly ok: false; readonly failure: 'link_invalid' | 'scope' | 'rate_limited' }

// PayPal's record is the truth: the receipt shows what PayPal says now, not what Hold last stored.
async function readFromPayPal(shopId: string, hold: RentalHold | undefined): Promise<PayPalReading | null> {
  if (hold?.paypalAuthorizationId == null) return null
  try {
    const { database } = await getServices()
    const paypal = await inShop(database, { role: 'hold_app', shopId }, (transaction) => paypalForShop(transaction, shopId))
    const read = await paypal?.readAuthorization(hold.paypalAuthorizationId)
    return read?.ok === true ? { status: read.value.status, amountCents: read.value.amount.cents, checkedAt: new Date() } : null
  } catch {
    return null
  }
}

export async function selfReturnPage(token: string): Promise<SelfReturnPage> {
  const now = new Date()
  const access = await renterAccess(token, 'view', now)
  if (!access.ok) return access
  const { database, evidence } = await getServices()
  const { rentalId, shopId } = access.link
  const loaded = await inShop(database, { role: 'hold_app', shopId }, async (transaction) => {
    const ownReturn = await selfReturnFor(transaction, rentalId)
    const baselines = ownReturn === undefined ? [] : await Promise.all(ownReturn.items.map((item) => returnBaseline(transaction, item.sessionId)))
    return { ownReturn, baselines, view: await renterView(transaction, rentalId, now), hold: await rentalHold(transaction, rentalId) }
  })
  const { ownReturn, view } = loaded
  if (ownReturn === undefined || view === undefined) return { ok: false, failure: 'link_invalid' }
  const link = async (key: string | null) => (key === null || evidence === undefined ? null : evidence.displayLink(key))
  const items = await Promise.all(ownReturn.items.map(async (item, index) => ({
    sessionId: item.sessionId,
    label: item.itemLabel,
    views: item.plan.map((each) => ({ key: each.key, label: each.label, outline: each.outline })),
    missing: item.missing,
    photos: await Promise.all(item.photos.map(async (photo) => ({ view: photo.view, url: await link(photo.displayKey), simulated: photo.simulated === true }))),
    guides: Object.fromEntries((await Promise.all((loaded.baselines[index] ?? []).map(async (photo) => [photo.view, await link(photo.displayKey)] as const))).filter((entry): entry is readonly [string, string] => entry[1] !== null)),
  })))
  const stage = selfReturnStage({ allowed: ownReturn.settings.allowed, rentalState: ownReturn.state, handedOver: ownReturn.handedOver, started: items.length > 0, droppedOffAt: ownReturn.droppedOffAt })
  return {
    ok: true,
    data: {
      shopName: view.shopName,
      simulated: view.simulated,
      canAct: access.link.scopes.includes('return_item'),
      stage,
      rentalState: ownReturn.state,
      dropPoint: ownReturn.settings.dropPoint,
      opening: shopOpening(ownReturn.settings.hours, ownReturn.timeZone, ownReturn.droppedOffAt ?? now),
      timeZone: ownReturn.timeZone,
      currency: view.currency,
      droppedOffAt: ownReturn.droppedOffAt,
      onTime: ownReturn.droppedOffAt !== null && returnedOnTime(ownReturn.droppedOffAt, ownReturn.endsAt),
      missingAt: ownReturn.missingAt,
      hold: loaded.hold === undefined ? null : { reservedCents: loaded.hold.reservedCents, state: loaded.hold.state },
      paypal: stage === 'sent' && !view.simulated ? await readFromPayPal(shopId, loaded.hold) : null,
      items,
    },
  }
}
