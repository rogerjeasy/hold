import { inShop, itemPassport, itemRepairs } from '@hold/db'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { PassportScreen } from '@/features/items/passport-screen'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shop.items.passport')
  return { title: t('label'), robots: { index: false, follow: false } }
}

export default async function Page({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params
  if (!z.uuid().safeParse(itemId).success) notFound()
  const context = await requireShop()
  const { database } = await getServices()
  const scope = { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId } as const
  const { passport, repairs } = await inShop(database, scope, async (transaction) => ({ passport: await itemPassport(transaction, itemId), repairs: await itemRepairs(transaction, itemId) }))
  if (passport === undefined) notFound()
  return <PassportScreen shopName={context.shop.name} clock={{ timeZone: context.shop.timeZone, currency: context.shop.currency }} passport={passport} role={context.role} repairs={repairs} />
}
