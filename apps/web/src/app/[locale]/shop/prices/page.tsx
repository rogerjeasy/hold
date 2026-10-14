import { amountText, money } from '@hold/domain'
import { currentPriceList, inShop } from '@hold/db'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { readAccessToken } from '@/features/auth/session-cookies'
import { PricesScreen } from '@/features/shop/prices-screen'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shop.prices')
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function Page() {
  const context = await requireShop()
  const { database, identity } = await getServices()
  const scope = { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId } as const
  const [current, passkeys] = await Promise.all([inShop(database, scope, currentPriceList), identity.listPasskeys((await readAccessToken()) ?? '')])
  const { currency, ownerApprovalThresholdCents } = context.shop
  const editor = {
    fixedCurrency: currency,
    threshold: currency === null || ownerApprovalThresholdCents === null ? '' : amountText(money(ownerApprovalThresholdCents, currency)),
    wearPolicy: current?.wearPolicy ?? '',
    rows: (current?.entries ?? []).map((entry) => ({
      description: entry.description,
      category: entry.category,
      amount: amountText(money(entry.amountCents, current?.currency ?? 'EUR')),
    })),
  }
  return (
    <PricesScreen
      shopName={context.shop.name}
      current={current}
      editor={editor}
      canPublish={context.role === 'owner' || context.role === 'manager'}
      gate={{ needed: context.passkeyNeeded, hasPasskey: passkeys.ok && passkeys.value.length > 0, email: context.person.email }}
    />
  )
}
