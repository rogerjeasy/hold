import { inShop, itemCatalog } from '@hold/db'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ItemTypeScreen } from '@/features/items/item-type-screen'
import { formValues, passkeyGate } from '@/features/items/type-page'
import { itemRoutes } from '@/lib/routes'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shop.items.type')
  return { title: t('edit'), robots: { index: false, follow: false } }
}

export default async function Page({ params }: { params: Promise<{ typeId: string }> }) {
  const { typeId } = await params
  const context = await requireShop()
  const { database } = await getServices()
  const scope = { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId } as const
  const type = (await inShop(database, scope, itemCatalog)).types.find((candidate) => candidate.id === typeId)
  // Another shop's type, a made-up address and a sample type all read the same: there is nothing here to edit.
  if (type === undefined || type.simulated) notFound()
  return (
    <ItemTypeScreen
      shopName={context.shop.name}
      currency={type.currency}
      values={formValues(type)}
      canManage={context.role === 'owner' || context.role === 'manager'}
      returnTo={itemRoutes.type(type.id)}
      gate={await passkeyGate(context)}
    />
  )
}
