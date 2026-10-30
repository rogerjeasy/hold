import { captureSession, inShop, itemPassport, itemRepairs, repairGuides } from '@hold/db'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { RepairScreen } from '@/features/repairs/repair-screen'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('repairs.page'))('title'), robots: { index: false, follow: false } }
}

// One repair of one item (architecture.md section 9.6). Another shop's repair, or one of another item, answers 404.
export default async function Page({ params }: { params: Promise<{ itemId: string; repairId: string }> }) {
  const { itemId, repairId } = await params
  if (!z.uuid().safeParse(itemId).success || !z.uuid().safeParse(repairId).success) notFound()
  const context = await requireShop()
  const { database, evidence } = await getServices()
  const loaded = await inShop(database, { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId }, async (transaction) => {
    const repair = (await itemRepairs(transaction, itemId)).find((each) => each.id === repairId)
    if (repair === undefined) return undefined
    return { repair, passport: await itemPassport(transaction, itemId), session: repair.sessionId === null ? undefined : await captureSession(transaction, repair.sessionId), guides: await repairGuides(transaction, repairId) }
  })
  if (loaded?.passport === undefined) notFound()
  const display = (key: string | null) => (key === null || evidence === undefined ? Promise.resolve(null) : evidence.displayLink(key))
  const { session } = loaded
  const view = session === undefined ? null : {
    id: session.id, itemLabel: session.itemLabel, sealed: session.sealedAt !== null, plan: session.plan, marks: [], missing: session.missing,
    photos: await Promise.all(session.photos.map(async (photo) => ({ view: photo.view, simulated: photo.simulated, url: await display(photo.displayKey) }))),
  }
  const guides = await Promise.all(loaded.guides.map(async (guide) => ({ view: guide.view, region: guide.region, description: guide.description, url: await display(guide.displayKey) })))
  return <RepairScreen shopName={context.shop.name} itemId={itemId} itemLabel={loaded.passport.item.label} clock={{ timeZone: context.shop.timeZone, currency: context.shop.currency }} repair={loaded.repair} session={view} guides={guides} canAct={context.role !== 'read_only'} />
}
