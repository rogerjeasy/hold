import 'server-only'
import { inShop, rentalHold, renterView } from '@hold/db'
import type { RentalHold, RenterView } from '@hold/db'
import type { Metadata } from 'next'
import { renterAccess } from './renter-access'
import { getServices } from './services'

// A renter's page carries the token in its address. It is nobody's search result, and it sends no referrer, so the
// token never reaches another site.
export const renterPageMetadata = (title: string): Metadata => ({ title, robots: { index: false, follow: false }, referrer: 'no-referrer' })

export type RenterPage = { readonly ok: true; readonly view: RenterView } | { readonly ok: false; readonly failure: 'link_invalid' | 'scope' | 'rate_limited' }

export async function renterPage(token: string): Promise<RenterPage> {
  const now = new Date()
  const access = await renterAccess(token, 'view', now)
  if (!access.ok) return access
  const { database } = await getServices()
  const view = await inShop(database, { role: 'hold_app', shopId: access.link.shopId }, (transaction) => renterView(transaction, access.link.rentalId, now))
  return view === undefined ? { ok: false, failure: 'link_invalid' } : { ok: true, view }
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
