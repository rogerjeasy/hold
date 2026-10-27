import { inShop, renterNegotiation, renterView } from '@hold/db'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { RenterNegotiationScreen } from '@/features/negotiation/renter-negotiation-screen'
import { LinkRefused } from '@/features/renter/link-refused'
import { renterAccess } from '@/server/renter-access'
import { renterPageMetadata } from '@/server/renter-page'
import { getServices } from '@/server/services'

export async function generateMetadata(): Promise<Metadata> {
  return renterPageMetadata((await getTranslations('negotiation'))('renterTitle'))
}

// The renter's advocate: the transcript, their own highest total, the final tap and the way to stop it. Visiting only
// reads; a link that may not answer the claim shows no forms.
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const now = new Date()
  const access = await renterAccess(token, 'view', now)
  if (!access.ok) return <LinkRefused failure={access.failure} />
  const { database } = await getServices()
  const loaded = await inShop(database, { role: 'hold_app', shopId: access.link.shopId }, async (transaction) => ({ negotiation: await renterNegotiation(transaction, access.link.rentalId), rental: await renterView(transaction, access.link.rentalId, now) }))
  if (loaded.negotiation === undefined || loaded.rental === undefined) return <LinkRefused failure="link_invalid" />
  const canAct = access.link.scopes.includes('accept') && access.link.scopes.includes('contest')
  return <RenterNegotiationScreen token={token} shopName={loaded.rental.shopName} data={loaded.negotiation} canAct={canAct} />
}
