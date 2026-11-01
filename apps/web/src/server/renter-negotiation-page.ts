import 'server-only'
import { inShop, renterNegotiation, renterView } from '@hold/db'
import type { RenterNegotiation } from '@hold/db'
import { renterAccess } from './renter-access'
import { getServices } from './services'

export type RenterNegotiationPage = { readonly ok: true; readonly shopName: string; readonly data: RenterNegotiation; readonly canAct: boolean } | { readonly ok: false; readonly failure: 'link_invalid' | 'scope' | 'rate_limited' | 'not_found' }

// The renter's advocate through their link: the transcript, their own highest total, the final tap and the way to stop
// it. Reading changes nothing; a link that may not answer the claim may only look. None yet is not found.
export async function renterNegotiationPage(token: string): Promise<RenterNegotiationPage> {
  const now = new Date()
  const access = await renterAccess(token, 'view', now)
  if (!access.ok) return access
  const { database } = await getServices()
  const loaded = await inShop(database, { role: 'hold_app', shopId: access.link.shopId }, async (transaction) => ({ negotiation: await renterNegotiation(transaction, access.link.rentalId), rental: await renterView(transaction, access.link.rentalId, now) }))
  if (loaded.negotiation === undefined || loaded.rental === undefined) return { ok: false, failure: 'not_found' }
  return { ok: true, shopName: loaded.rental.shopName, data: loaded.negotiation, canAct: access.link.scopes.includes('accept') && access.link.scopes.includes('contest') }
}
