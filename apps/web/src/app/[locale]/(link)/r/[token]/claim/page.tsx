import { getLocale, getTranslations } from 'next-intl/server'
import { LinkRefused } from '@/features/renter/link-refused'
import { RenterClaimScreen } from '@/features/claims/renter-claim-screen'
import { renterClaimPage } from '@/server/renter-claim-page'
import { renterPageMetadata } from '@/server/renter-page'
export async function generateMetadata() { return renterPageMetadata((await getTranslations('claim'))('renterTitle')) }
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const page = await renterClaimPage(token, await getLocale())
  // No claim a person approved yet reads as a link that cannot be used, as before.
  return page.ok ? <RenterClaimScreen token={token} data={page.data} /> : <LinkRefused failure={page.failure === 'not_found' ? 'link_invalid' : page.failure} />
}
