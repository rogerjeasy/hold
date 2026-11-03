import { getLocale, getTranslations } from 'next-intl/server'
import { LinkRefused } from '@/features/renter/link-refused'
import { LinkUnavailable } from '@/features/renter/link-unavailable'
import { RenterClaimScreen } from '@/features/claims/renter-claim-screen'
import { renterClaimPage } from '@/server/renter-claim-page'
import { renterPageMetadata } from '@/server/renter-page'
export async function generateMetadata() { return renterPageMetadata((await getTranslations('claim'))('renterTitle')) }
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const page = await renterClaimPage(token, await getLocale())
  if (page.ok) return <RenterClaimScreen token={token} data={page.data} />
  // No claim a person approved yet: the link works, and the page says there is nothing to review.
  return page.failure === 'not_found' ? <LinkUnavailable token={token} reason="no_claim" /> : <LinkRefused failure={page.failure} />
}
