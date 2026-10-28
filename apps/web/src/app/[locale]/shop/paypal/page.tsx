import { findPayPalAccount, inShop } from '@hold/db'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { readAccessToken } from '@/features/auth/session-cookies'
import { PayPalScreen } from '@/features/shop/paypal-screen'
import { DEMO_PAYPAL_REFERENCE, getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shop.paypal')
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function Page() {
  const context = await requireShop()
  const { database, identity, config } = await getServices()
  const scope = { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId } as const
  const [account, passkeys] = await Promise.all([
    inShop(database, scope, (transaction) => findPayPalAccount(transaction, context.shop.id, config.paypalMode)),
    identity.listPasskeys((await readAccessToken()) ?? ''),
  ])
  return (
    <PayPalScreen
      shopName={context.shop.name}
      connectedAt={account?.createdAt}
      notifications={account?.credentialReference === DEMO_PAYPAL_REFERENCE ? (account.webhookId != null ? 'demo_on' : 'demo') : account?.webhookId != null ? 'on' : 'off'}
      isOwner={context.role === 'owner'}
      gate={{ needed: context.passkeyNeeded, hasPasskey: passkeys.ok && passkeys.value.length > 0, email: context.person.email }}
    />
  )
}
