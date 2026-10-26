import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { RenterIncidentsScreen } from '@/features/incidents/renter-incidents-screen'
import { LinkRefused } from '@/features/renter/link-refused'
import { incidentsPage } from '@/server/incident-page'
import { renterPageMetadata } from '@/server/renter-page'

export async function generateMetadata(): Promise<Metadata> {
  return renterPageMetadata((await getTranslations('renter.incident'))('title'))
}

// "Something happened" during the rental (extensions.md section 10). Only a link that may report opens it.
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const page = await incidentsPage(token)
  return page.ok ? <RenterIncidentsScreen token={token} shopName={page.shopName} open={page.open} items={page.items} earlier={page.earlier} /> : <LinkRefused failure={page.failure} />
}
