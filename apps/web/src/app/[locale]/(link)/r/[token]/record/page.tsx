import { evidenceVersions, inShop, receiptDeliveriesFor, renterView } from '@hold/db'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { EvidenceRecordScreen } from '@/features/records/evidence-record-screen'
import { buildRenterRecord, downloadRenterRecord } from '@/features/records/renter-actions'
import { LinkRefused } from '@/features/renter/link-refused'
import { linkRoutes } from '@/lib/routes'
import { renterAccess } from '@/server/renter-access'
import { renterPageMetadata } from '@/server/renter-page'
import { getServices } from '@/server/services'

export async function generateMetadata(): Promise<Metadata> {
  return renterPageMetadata((await getTranslations('records'))('title'))
}

export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ version?: string | string[] }> }) {
  const { token } = await params
  const now = new Date()
  const access = await renterAccess(token, 'view', now)
  if (!access.ok) return <LinkRefused failure={access.failure} />
  const selected = z.strictObject({ version: z.uuid().optional() }).safeParse(await searchParams)
  if (!selected.success) return <LinkRefused failure="link_invalid" />
  const { database } = await getServices()
  const { rentalId, shopId } = access.link
  const loaded = await inShop(database, { role: 'hold_app', shopId }, async (transaction) => ({ view: await renterView(transaction, rentalId, now), versions: await evidenceVersions(transaction, rentalId, true), receipts: await receiptDeliveriesFor(transaction, rentalId) }))
  if (loaded.view === undefined) return <LinkRefused failure="link_invalid" />
  const versions = selected.data.version === undefined ? loaded.versions : loaded.versions.filter((version) => version.id === selected.data.version)
  if (selected.data.version !== undefined && versions.length === 0) return <LinkRefused failure="link_invalid" />
  const receipts = loaded.receipts.filter((receipt) => versions.some((version) => version.id === receipt.packId))
  return <EvidenceRecordScreen shopName={loaded.view.shopName} rentalId={rentalId} token={token} backHref={`${linkRoutes.renter}/${token}`} versions={versions} receipts={receipts} build={buildRenterRecord} download={downloadRenterRecord} />
}
