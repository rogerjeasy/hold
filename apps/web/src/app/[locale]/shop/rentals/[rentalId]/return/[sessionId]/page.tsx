import { captureSession, inShop, returnBaseline } from '@hold/db'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ReturnScreen } from '@/features/returns/return-screen'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shop.returns')
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function Page({ params }: { params: Promise<{ rentalId: string; sessionId: string }> }) {
  const { rentalId, sessionId } = await params
  const context = await requireShop()
  const { database, evidence } = await getServices()
  const data = await inShop(database, { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId }, async (transaction) => ({ session: await captureSession(transaction, sessionId), baseline: await returnBaseline(transaction, sessionId) }))
  if (data.session?.kind !== 'return' || data.session.rentalId !== rentalId) notFound()
  const display = async (photo: { view: string; displayKey: string | null; simulated?: boolean }) => ({ view: photo.view, simulated: photo.simulated, url: photo.displayKey === null || evidence === undefined ? null : await evidence.displayLink(photo.displayKey) })
  const photos = await Promise.all(data.session.photos.map(display))
  const baseline = await Promise.all(data.baseline.map(display))
  return <ReturnScreen shopName={context.shop.name} rentalId={rentalId} session={{ id: data.session.id, itemLabel: data.session.itemLabel, sealed: data.session.sealedAt !== null, plan: data.session.plan, photos, baseline, marks: data.session.marks, missing: data.session.missing }} canAct={context.role !== 'read_only'} />
}
