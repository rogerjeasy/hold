import { currentTrustLadder, inShop, shopOutcomes } from '@hold/db'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { TrustScreen } from '@/features/trust/trust-screen'
import { passkeyGate } from '@/server/passkey-gate'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('trust.ladder')
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function Page() {
  const context = await requireShop()
  const { database } = await getServices()
  const scope = { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId } as const
  const [loaded, gate] = await Promise.all([
    inShop(database, scope, async (transaction) => ({ current: await currentTrustLadder(transaction), ledger: await shopOutcomes(transaction, new Date()) })),
    passkeyGate(context),
  ])
  return (
    <TrustScreen
      shopName={context.shop.name}
      timeZone={context.shop.timeZone}
      current={loaded.current}
      currency={context.shop.currency}
      canPublish={context.role === 'owner'}
      gate={gate}
      ledger={loaded.ledger}
    />
  )
}
