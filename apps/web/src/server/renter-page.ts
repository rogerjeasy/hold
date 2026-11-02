import 'server-only'
import { captureSession, conditionConfirmation, conditionReport, extensionMaxDays, inShop, photoProvenance, rentalAssistant, rentalHold, rentalRenterKey, renterView, selfReturnFor, trustConsent } from '@hold/db'
import type { RentalHold, RenterView } from '@hold/db'
import { maySelfReturn, shopOpening } from '@hold/domain'
import type { Metadata } from 'next'
import type { RenterContactView } from '@/features/contact/contact-view'
import type { SelfReturnOffer } from '@/features/self-return/self-return-card'
import type { ConditionView } from '@/features/renter/condition-screen'
import type { PayPalCheckout } from '@/features/renter/paypal-sdk'
import { paypalCheckout } from './paypal-checkout'
import { renterAccess } from './renter-access'
import { renterContactView } from './renter-contact-view'
import { getServices } from './services'

// A renter's page carries the token in its address. It is nobody's search result, and it sends no referrer, so the
// token never reaches another site.
export const renterPageMetadata = (title: string): Metadata => ({ title, robots: { index: false, follow: false }, referrer: 'no-referrer' })

// askConsent: PayPal has named the renter, who has not yet answered whether other Hold shops may use their Clean Record.
// The question is asked once (extensions.md section 7.6).
// assistant: the renter's own assistant booked this rental (extensions.md section 8.5), and whether it is connected.
// checkout: the shop's PayPal app for PayPal's own button, while the fee is still to pay.
// selfReturn: whether the renter may return the item with nobody at the counter, or already did (section 6.13).
// contact: how the renter is reached, by text or by email (section 12.3).
export type RenterPage =
  | { readonly ok: true; readonly view: RenterView; readonly canReport: boolean; readonly askConsent: boolean; readonly assistant: { readonly connected: boolean; readonly revoked: boolean } | null; readonly checkout: PayPalCheckout | undefined; readonly selfReturn: SelfReturnOffer; readonly canExtend: boolean; readonly contact: RenterContactView | undefined }
  | { readonly ok: false; readonly failure: 'link_invalid' | 'scope' | 'rate_limited' }

export async function renterPage(token: string): Promise<RenterPage> {
  const now = new Date()
  const access = await renterAccess(token, 'view', now)
  if (!access.ok) return access
  const { database } = await getServices()
  const { rentalId } = access.link
  const loaded = await inShop(database, { role: 'hold_app', shopId: access.link.shopId }, async (transaction) => {
    const renter = await rentalRenterKey(transaction, rentalId)
    const consent = renter.key === undefined ? undefined : await trustConsent(transaction, renter.key)
    const assistant = await rentalAssistant(transaction, rentalId)
    const view = await renterView(transaction, rentalId, now)
    return { view, askConsent: renter.known && consent?.answered !== true, assistant: assistant === undefined ? null : { connected: assistant.connected, revoked: assistant.revokedAt !== null }, ownReturn: await selfReturnFor(transaction, rentalId), maxDays: await extensionMaxDays(transaction), contact: view === undefined ? undefined : await renterContactView(transaction, rentalId, view.state) }
  })
  if (loaded.view === undefined) return { ok: false, failure: 'link_invalid' }
  const checkout = loaded.view.state === 'pending_payment' ? await paypalCheckout(access.link.shopId) : undefined
  const { ownReturn } = loaded
  const selfReturn: SelfReturnOffer = ownReturn === undefined ? { offered: false, shopClosed: false, droppedOffAt: null }
    : {
        offered: access.link.scopes.includes('return_item') && maySelfReturn({ allowed: ownReturn.settings.allowed, rentalState: ownReturn.state, handedOver: ownReturn.handedOver }),
        shopClosed: shopOpening(ownReturn.settings.hours, ownReturn.timeZone, now)?.open === false,
        droppedOffAt: ownReturn.droppedOffAt,
      }
  return { ok: true, view: loaded.view, canReport: access.link.scopes.includes('report_incident'), askConsent: loaded.askConsent, assistant: loaded.assistant, checkout, selfReturn, canExtend: access.link.scopes.includes('extend') && loaded.view.state === 'out' && loaded.maxDays > 0, contact: loaded.contact }
}

export type RenterHoldPage = { readonly ok: true; readonly view: RenterView; readonly hold: RentalHold | undefined; readonly checkout: PayPalCheckout | undefined; readonly contact: RenterContactView | undefined } | { readonly ok: false; readonly failure: 'link_invalid' | 'scope' | 'rate_limited' }

// The rental and its hold, for the page where the renter approves the hold at pickup.
export async function renterHoldPage(token: string): Promise<RenterHoldPage> {
  const now = new Date()
  const access = await renterAccess(token, 'view', now)
  if (!access.ok) return access
  const { database } = await getServices()
  const { rentalId, shopId } = access.link
  const { view, hold, contact } = await inShop(database, { role: 'hold_app', shopId }, async (transaction) => {
    const view = await renterView(transaction, rentalId, now)
    return { view, hold: await rentalHold(transaction, rentalId), contact: view === undefined ? undefined : await renterContactView(transaction, rentalId, view.state) }
  })
  if (view === undefined) return { ok: false, failure: 'link_invalid' }
  // PayPal's own button only while there is a hold to approve: asked for at pickup, or a replacement waiting.
  const checkout = hold !== undefined && (hold.state === 'requested' || hold.orderId !== null) ? await paypalCheckout(shopId) : undefined
  return { ok: true, view, hold, checkout, contact }
}

export type ConditionPage = { readonly ok: true; readonly report: ConditionView } | { readonly ok: false; readonly failure: 'link_invalid' | 'scope' | 'rate_limited' | 'not_handed_over' }

// The condition report through a renter's link. Any link to the rental may look; only the one sent at handover may
// answer. Photographs are shown through short-lived signed links to their display copies.
export async function conditionPage(token: string): Promise<ConditionPage> {
  const now = new Date()
  const access = await renterAccess(token, 'view', now)
  if (!access.ok) return access
  const { database, evidence } = await getServices()
  const { rentalId, shopId } = access.link
  const loaded = await inShop(database, { role: 'hold_app', shopId }, async (transaction) => {
    const report = await conditionReport(transaction, rentalId, now)
    const view = await renterView(transaction, rentalId, now)
    const sessions = report === undefined ? [] : await Promise.all(report.items.map((item) => captureSession(transaction, item.sessionId)))
    const keys = (report?.items ?? []).flatMap((item) => item.photos.flatMap((photo) => (photo.displayKey === null ? [] : [photo.displayKey])))
    return { report, view, sessions, provenance: await photoProvenance(transaction, keys), confirmed: await conditionConfirmation(transaction, rentalId) }
  })
  if (loaded.report === undefined || loaded.view === undefined) return { ok: false, failure: 'not_handed_over' }
  const link = async (key: string | null) => (key === null || evidence === undefined ? null : evidence.displayLink(key))
  const items = await Promise.all(
    loaded.report.items.map(async (item, index) => {
      const plan = loaded.sessions[index]?.plan ?? []
      return {
        itemId: loaded.sessions[index]?.itemId ?? item.rentalItemId,
        label: item.label,
        // In the plan's order, as staff took them.
        photos: await Promise.all(
          [...item.photos]
            .sort((first, second) => plan.findIndex((each) => each.key === first.view) - plan.findIndex((each) => each.key === second.view))
            .map(async (photo) => ({ view: photo.view, label: plan.find((each) => each.key === photo.view)?.label ?? photo.view, url: await link(photo.displayKey), provenance: (photo.displayKey === null ? undefined : loaded.provenance.get(photo.displayKey)) ?? null })),
        ),
        marks: item.marks.map((mark) => ({ id: mark.id, view: mark.view, region: mark.region, description: mark.description })),
        added: await Promise.all(item.added.map(async (photo) => ({ view: photo.view, url: await link(photo.displayKey) }))),
      }
    }),
  )
  return {
    ok: true,
    report: { shopName: loaded.view.shopName, timeZone: loaded.view.timeZone, open: loaded.report.open, reply: loaded.report.reply, closesAt: loaded.report.closesAt, canReply: access.link.scopes.includes('confirm_condition'), confirmed: loaded.confirmed, items },
  }
}
