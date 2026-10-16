import { captureSession, inShop } from '@hold/db'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { HandoverScreen } from '@/features/handover/handover-screen'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shop.handover')
  return { title: t('label'), robots: { index: false, follow: false } }
}

// One item's handover photographs. Each display copy is shown through a short-lived signed link.
export default async function Page({ params }: { params: Promise<{ rentalId: string; sessionId: string }> }) {
  const { rentalId, sessionId } = await params
  const context = await requireShop()
  const { database, evidence } = await getServices()
  const session = await inShop(database, { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId }, (transaction) => captureSession(transaction, sessionId))
  // Another shop's session, another rental's, and a made-up address read the same.
  if (session === undefined || session.rentalId !== rentalId || session.kind !== 'handover') notFound()
  const photos = await Promise.all(session.photos.map(async (photo) => ({ view: photo.view, url: photo.displayKey === null || evidence === undefined ? null : await evidence.displayLink(photo.displayKey) })))
  return (
    <HandoverScreen
      shopName={context.shop.name}
      rentalId={rentalId}
      session={{ id: session.id, itemLabel: session.itemLabel, sealed: session.sealedAt !== null, plan: session.plan, photos, marks: session.marks, missing: session.missing }}
    />
  )
}
