import 'server-only'
import { captureSession, conditionReport, inShop, rentalHold, rentalRenterKey, renterView, trustConsent } from '@hold/db'
import type { RentalHold, RenterView } from '@hold/db'
import type { Metadata } from 'next'
import type { ConditionView } from '@/features/renter/condition-screen'
import { renterAccess } from './renter-access'
import { getServices } from './services'

// A renter's page carries the token in its address. It is nobody's search result, and it sends no referrer, so the
// token never reaches another site.
export const renterPageMetadata = (title: string): Metadata => ({ title, robots: { index: false, follow: false }, referrer: 'no-referrer' })

// askConsent: PayPal has named the renter, who has not yet answered whether other Hold shops may use their Clean Record.
// The question is asked once (extensions.md section 7.6).
export type RenterPage = { readonly ok: true; readonly view: RenterView; readonly askConsent: boolean } | { readonly ok: false; readonly failure: 'link_invalid' | 'scope' | 'rate_limited' }

export async function renterPage(token: string): Promise<RenterPage> {
  const now = new Date()
  const access = await renterAccess(token, 'view', now)
  if (!access.ok) return access
  const { database } = await getServices()
  const { rentalId } = access.link
  const loaded = await inShop(database, { role: 'hold_app', shopId: access.link.shopId }, async (transaction) => {
    const renter = await rentalRenterKey(transaction, rentalId)
    const consent = renter.key === undefined ? undefined : await trustConsent(transaction, renter.key)
    return { view: await renterView(transaction, rentalId, now), askConsent: renter.known && consent?.answered !== true }
  })
  return loaded.view === undefined ? { ok: false, failure: 'link_invalid' } : { ok: true, view: loaded.view, askConsent: loaded.askConsent }
}

export type RenterHoldPage = { readonly ok: true; readonly view: RenterView; readonly hold: RentalHold | undefined } | { readonly ok: false; readonly failure: 'link_invalid' | 'scope' | 'rate_limited' }

// The rental and its hold, for the page where the renter approves the hold at pickup.
export async function renterHoldPage(token: string): Promise<RenterHoldPage> {
  const now = new Date()
  const access = await renterAccess(token, 'view', now)
  if (!access.ok) return access
  const { database } = await getServices()
  const { rentalId, shopId } = access.link
  const { view, hold } = await inShop(database, { role: 'hold_app', shopId }, async (transaction) => ({ view: await renterView(transaction, rentalId, now), hold: await rentalHold(transaction, rentalId) }))
  return view === undefined ? { ok: false, failure: 'link_invalid' } : { ok: true, view, hold }
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
    return { report, view, sessions }
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
            .map(async (photo) => ({ view: photo.view, label: plan.find((each) => each.key === photo.view)?.label ?? photo.view, url: await link(photo.displayKey) })),
        ),
        marks: item.marks.map((mark) => ({ id: mark.id, view: mark.view, region: mark.region, description: mark.description })),
        added: await Promise.all(item.added.map(async (photo) => ({ view: photo.view, url: await link(photo.displayKey) }))),
      }
    }),
  )
  return {
    ok: true,
    report: { shopName: loaded.view.shopName, timeZone: loaded.view.timeZone, open: loaded.report.open, reply: loaded.report.reply, closesAt: loaded.report.closesAt, canReply: access.link.scopes.includes('confirm_condition'), items },
  }
}
