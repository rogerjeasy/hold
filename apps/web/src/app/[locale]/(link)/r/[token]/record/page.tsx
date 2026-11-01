import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { EvidenceRecordScreen } from '@/features/records/evidence-record-screen'
import { buildRenterRecord, downloadRenterRecord } from '@/features/records/renter-actions'
import { LinkRefused } from '@/features/renter/link-refused'
import { linkRoutes } from '@/lib/routes'
import { renterPageMetadata } from '@/server/renter-page'
import { renterRecordPage } from '@/server/renter-record-page'

export async function generateMetadata(): Promise<Metadata> {
  return renterPageMetadata((await getTranslations('records'))('title'))
}

export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ version?: string | string[] }> }) {
  const { token } = await params
  const page = await renterRecordPage(token, await searchParams)
  if (!page.ok) return <LinkRefused failure={page.failure === 'not_found' ? 'link_invalid' : page.failure} />
  return <EvidenceRecordScreen shopName={page.shopName} rentalId={page.rentalId} token={token} backHref={`${linkRoutes.renter}/${token}`} versions={page.versions} receipts={page.receipts} build={buildRenterRecord} download={downloadRenterRecord} />
}
