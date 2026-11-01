import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { RenterNegotiationScreen } from '@/features/negotiation/renter-negotiation-screen'
import { LinkRefused } from '@/features/renter/link-refused'
import { renterNegotiationPage } from '@/server/renter-negotiation-page'
import { renterPageMetadata } from '@/server/renter-page'

export async function generateMetadata(): Promise<Metadata> {
  return renterPageMetadata((await getTranslations('negotiation'))('renterTitle'))
}

// The renter's advocate: the transcript, their own highest total, the final tap and the way to stop it. Visiting only
// reads; a link that may not answer the claim shows no forms. No negotiation yet reads as a link that cannot be used.
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const page = await renterNegotiationPage(token)
  if (!page.ok) return <LinkRefused failure={page.failure === 'not_found' ? 'link_invalid' : page.failure} />
  return <RenterNegotiationScreen token={token} shopName={page.shopName} data={page.data} canAct={page.canAct} />
}
