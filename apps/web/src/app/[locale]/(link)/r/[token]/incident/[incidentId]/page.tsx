import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { RenterIncidentScreen } from '@/features/incidents/renter-incident-screen'
import { LinkRefused } from '@/features/renter/link-refused'
import { incidentPage } from '@/server/incident-page'
import { renterPageMetadata } from '@/server/renter-page'

export async function generateMetadata(): Promise<Metadata> {
  return renterPageMetadata((await getTranslations('renter.incident'))('title'))
}

// One report: its photographs while it is written, then what the sorting found. Another rental's report reads as a
// link that cannot be used.
export default async function Page({ params }: { params: Promise<{ token: string; incidentId: string }> }) {
  const { token, incidentId } = await params
  if (!z.uuid().safeParse(incidentId).success) return <LinkRefused failure="link_invalid" />
  const page = await incidentPage(token, incidentId)
  return page.ok ? <RenterIncidentScreen token={token} shopName={page.shopName} incident={page.incident} capture={page.capture} /> : <LinkRefused failure={page.failure} />
}
