import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { ItemTypeScreen } from '@/features/items/item-type-screen'
import { passkeyGate } from '@/server/passkey-gate'
import { redirect } from '@/i18n/navigation'
import { itemRoutes, shopRoutes } from '@/lib/routes'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shop.items.form')
  return { title: t('newTitle'), robots: { index: false, follow: false } }
}

export default async function Page() {
  const context = await requireShop()
  // Every amount is in the shop's currency, which its first price list sets. The items page says so.
  const { currency } = context.shop
  if (currency === null) return redirect({ href: shopRoutes.items, locale: await getLocale() })
  return (
    <ItemTypeScreen
      shopName={context.shop.name}
      currency={currency}
      values={undefined}
      canManage={context.role === 'owner' || context.role === 'manager'}
      returnTo={itemRoutes.newType}
      gate={await passkeyGate(context)}
    />
  )
}
