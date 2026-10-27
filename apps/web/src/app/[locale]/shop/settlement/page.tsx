import { checkSettlementLimits } from '@hold/domain'
import { inShop, liveShopSettlement } from '@hold/db'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { SettlementLimitsScreen } from '@/features/negotiation/settlement-limits-screen'
import { passkeyGate } from '@/server/passkey-gate'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('negotiation.limits'))('title'), robots: { index: false, follow: false } }
}

// The shop advocate's limits. Only the owner reads them: for anyone else the page loads none.
export default async function Page() {
  const context = await requireShop()
  const owner = context.role === 'owner'
  const { database } = await getServices()
  const mandate = owner ? await inShop(database, { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId }, (transaction) => liveShopSettlement(transaction, new Date())) : undefined
  const limits = mandate === undefined ? undefined : checkSettlementLimits('settlement_shop', mandate.limits)
  const current = mandate === undefined || limits?.ok !== true ? null : { lowestSharePercent: limits.value.lowestSharePercent, largestClaimCents: limits.value.largestClaimCents, rounds: limits.value.rounds, evidenceRequired: limits.value.evidenceRequired, validUntil: mandate.validUntil }
  return <SettlementLimitsScreen shopName={context.shop.name} currency={context.shop.currency} current={current} canEdit={owner} gate={owner ? await passkeyGate(context) : undefined} />
}
