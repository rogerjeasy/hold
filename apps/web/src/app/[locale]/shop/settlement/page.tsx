import { checkSettlementLimits } from '@hold/domain'
import { decisionPromiseDays, inShop, liveShopSettlement, liveStandingRule } from '@hold/db'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { SettlementLimitsSection } from '@/features/negotiation/settlement-limits-screen'
import { PromiseSettingsSection } from '@/features/promise/promise-settings'
import { ShopFrame } from '@/features/shop/shop-frame'
import { passkeyGate } from '@/server/passkey-gate'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('promise'))('settingsTitle'), robots: { index: false, follow: false } }
}

// Contested claims: the shop's promise to decide one (architecture.md section 6.16), which every member reads, and the
// shop advocate's limits (extensions.md section 9.4), which only the owner reads. Only the owner changes either.
export default async function Page() {
  const context = await requireShop()
  const owner = context.role === 'owner'
  const now = new Date()
  const { database } = await getServices()
  const t = await getTranslations('promise')
  const loaded = await inShop(database, { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId }, async (transaction) => ({
    days: await decisionPromiseDays(transaction),
    waiver: await liveStandingRule(transaction, now, 'decision_promise_missed'),
    mandate: owner ? await liveShopSettlement(transaction, now) : undefined,
  }))
  const limits = loaded.mandate === undefined ? undefined : checkSettlementLimits('settlement_shop', loaded.mandate.limits)
  const current = loaded.mandate === undefined || limits?.ok !== true ? null : { lowestSharePercent: limits.value.lowestSharePercent, largestClaimCents: limits.value.largestClaimCents, rounds: limits.value.rounds, evidenceRequired: limits.value.evidenceRequired, validUntil: loaded.mandate.validUntil }
  const waiverLimits = loaded.waiver?.limits
  const waiver = loaded.waiver === undefined ? null : { validUntil: loaded.waiver.validUntil, dailyCount: waiverLimits !== undefined && 'dailyCount' in waiverLimits && typeof waiverLimits.dailyCount === 'number' ? waiverLimits.dailyCount : 0 }
  const gate = owner ? await passkeyGate(context) : undefined
  return (
    <ShopFrame shopName={context.shop.name} title={t('settingsTitle')}>
      <div className="grid max-w-5xl gap-12">
        <p className="max-w-prose text-lead text-pretty">{t('settingsLead')}</p>
        <PromiseSettingsSection shopName={context.shop.name} days={loaded.days} waiver={waiver} canEdit={owner} gate={gate} />
        <SettlementLimitsSection currency={context.shop.currency} current={current} canEdit={owner} gate={gate} />
      </div>
    </ShopFrame>
  )
}
