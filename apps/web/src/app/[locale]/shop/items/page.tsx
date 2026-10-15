import { inShop, itemCatalog } from '@hold/db'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ItemsScreen } from '@/features/items/items-screen'
import { readFilter } from '@/features/items/standing'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shop.items')
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function Page({ searchParams }: { searchParams: Promise<{ show?: string | string[] }> }) {
  const context = await requireShop()
  const { database } = await getServices()
  const scope = { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId } as const
  const catalog = await inShop(database, scope, itemCatalog)
  return (
    <ItemsScreen
      shopName={context.shop.name}
      clock={{ timeZone: context.shop.timeZone, currency: context.shop.currency }}
      catalog={catalog}
      show={readFilter((await searchParams).show)}
      canManage={context.role === 'owner' || context.role === 'manager'}
    />
  )
}
