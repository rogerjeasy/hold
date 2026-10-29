import { inShop, selfReturnSettings } from '@hold/db'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { SelfReturnSettingsScreen } from '@/features/self-return/self-return-settings-screen'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('selfReturn.settings'))('title'), robots: { index: false, follow: false } }
}

// Returns with nobody at the counter: on or off, where renters leave items, and when the counter is staffed.
export default async function Page() {
  const context = await requireShop()
  const { database } = await getServices()
  const settings = await inShop(database, { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId }, selfReturnSettings)
  return <SelfReturnSettingsScreen shopName={context.shop.name} settings={settings} canEdit={context.role === 'owner'} />
}
