import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { readAccessToken } from '@/features/auth/session-cookies'
import { SecurityScreen } from '@/features/shop/security-screen'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shop.security')
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function Page() {
  const context = await requireShop()
  const listed = await (await getServices()).identity.listPasskeys((await readAccessToken()) ?? '')
  const required = context.role === 'owner' || context.role === 'manager' || context.passkeyNeeded
  return <SecurityScreen shopName={context.shop.name} passkeys={listed.ok ? listed.value : undefined} required={required} />
}
