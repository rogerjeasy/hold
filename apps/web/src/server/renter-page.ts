import 'server-only'
import { inShop, renterView } from '@hold/db'
import type { RenterView } from '@hold/db'
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
