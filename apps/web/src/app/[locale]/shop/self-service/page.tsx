import { extensionMaxDays, inShop, selfReturnSettings } from '@hold/db'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ExtensionSettingsSection } from '@/features/extension/extension-settings'
import { SelfReturnSettingsSection } from '@/features/self-return/self-return-settings-screen'
import { ShopFrame } from '@/features/shop/shop-frame'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('selfService'))('title'), robots: { index: false, follow: false } }
}

// What renters may do from their phone with nobody to ask: return items after hours (architecture.md section 6.13) and
// keep them longer (section 6.14). The owner decides; everyone else reads what renters are told.
export default async function Page() {
  const context = await requireShop()
  const { database } = await getServices()
  const t = await getTranslations('selfService')
  const loaded = await inShop(database, { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId }, async (transaction) => ({ settings: await selfReturnSettings(transaction), maxDays: await extensionMaxDays(transaction) }))
  const owner = context.role === 'owner'
  return (
    <ShopFrame shopName={context.shop.name} title={t('title')} description={t('lead')}>
      <div className="grid max-w-5xl min-w-0 gap-6">
        <SelfReturnSettingsSection shopName={context.shop.name} settings={loaded.settings} canEdit={owner} />
        <ExtensionSettingsSection maxDays={loaded.maxDays} canEdit={owner} />
      </div>
    </ShopFrame>
  )
}
