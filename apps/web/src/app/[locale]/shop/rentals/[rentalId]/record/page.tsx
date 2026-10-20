import { evidenceVersions, inShop, receiptDeliveriesFor, rentalDetail } from '@hold/db'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { buildRecord, downloadRecord } from '@/features/records/actions'
import { EvidenceRecordScreen } from '@/features/records/evidence-record-screen'
import { rentalRoutes } from '@/lib/routes'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('records'))('title'), robots: { index: false, follow: false } }
}

export default async function Page({ params, searchParams }: { params: Promise<{ rentalId: string }>; searchParams: Promise<{ version?: string | string[] }> }) {
  const context = await requireShop()
  const { rentalId } = await params
  const selected = z.strictObject({ version: z.uuid().optional() }).safeParse(await searchParams)
  if (!z.uuid().safeParse(rentalId).success || !selected.success) notFound()
  const { database } = await getServices()
  const loaded = await inShop(database, { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId }, async (transaction) => {
    if (await rentalDetail(transaction, rentalId, new Date()) === undefined) return undefined
    return { versions: await evidenceVersions(transaction, rentalId), receipts: await receiptDeliveriesFor(transaction, rentalId) }
  })
  if (loaded === undefined) notFound()
  const versions = selected.data.version === undefined ? loaded.versions : loaded.versions.filter((version) => version.id === selected.data.version)
  if (selected.data.version !== undefined && versions.length === 0) notFound()
  const receipts = loaded.receipts.filter((receipt) => versions.some((version) => version.id === receipt.packId))
  return <EvidenceRecordScreen shopName={context.shop.name} rentalId={rentalId} backHref={rentalRoutes.rental(rentalId)} versions={versions} receipts={receipts} build={buildRecord} download={downloadRecord} canBuild={context.role !== 'read_only'} />
}
