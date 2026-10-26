import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { LinkRefused } from '@/features/renter/link-refused'
import { RenterScreen } from '@/features/renter/renter-screen'
import { renterPage, renterPageMetadata } from '@/server/renter-page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('renter')
  return renterPageMetadata(t('lead'))
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const page = await renterPage(token)
  return page.ok ? <RenterScreen token={token} view={page.view} askConsent={page.askConsent} /> : <LinkRefused failure={page.failure} />
}
