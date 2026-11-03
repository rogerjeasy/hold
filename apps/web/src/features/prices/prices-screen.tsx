import { RepairCostSection } from './repair-cost-section'
import type { RepairCostRow } from './repair-cost-rows'
import type { PriceListVersion, PublishedPriceList } from '@hold/db'
import { amountText, money } from '@hold/domain'
import { Eye } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/routing'
import { shopRoutes } from '@/lib/routes'
import { PasskeyGate } from '@/features/shop/passkey-gate'
import type { PasskeyGateState } from '@/features/shop/passkey-gate'
import { ShopFrame } from '@/features/shop/shop-frame'
import type { Draft } from './editor-model'
import { emptyDraft } from './editor-model'
import { PriceEditor } from './price-editor'
import type { TermsMessages } from './terms-preview'
import { VersionsPanel } from './versions-panel'

export type PricesScreenProps = {
  shopName: string
  shopId: string
  current: PublishedPriceList | undefined
  versions: readonly PriceListVersion[]
  fixedCurrency: string | null
  threshold: string
  canPublish: boolean
  gate: PasskeyGateState
  // What repairs cost against each price (architecture.md section 9.6).
  repairCosts?: readonly RepairCostRow[]
  previewTerms: Readonly<Record<Locale, TermsMessages>>
}

// The version in force as the draft the editor starts from, each amount as the shop would type it.
function publishedDraft(current: PublishedPriceList | undefined): Draft {
  if (current === undefined) return emptyDraft()
  return { rows: current.entries.map((entry, key) => ({ key, description: entry.description, category: entry.category, amount: amountText(money(entry.amountCents, current.currency)) })), wearPolicy: current.wearPolicy }
}

// The shop's prices and wear policy: what is in force, the editor for the next version, and every version with what
// changed. Publishing needs an owner or a manager, proven by a passkey; everyone else reads the versions.
export function PricesScreen({ shopName, shopId, current, versions, fixedCurrency, threshold, canPublish, gate, previewTerms, repairCosts = [] }: PricesScreenProps) {
  const t = useTranslations('shop.prices')
  const format = useFormatter()
  return (
    <ShopFrame shopName={shopName} title={t('title')} description={current === undefined ? t('none') : t('current', { version: current.version, date: format.dateTime(current.publishedAt, { dateStyle: 'medium' }) })}>
      <div className="grid min-w-0 gap-8">
        {!canPublish ? (
          <>
            <p className="flex items-center gap-2 text-muted-foreground"><Eye aria-hidden="true" className="size-4 shrink-0" />{t('readOnly')}</p>
            <VersionsPanel versions={versions} currency={current?.currency ?? fixedCurrency ?? 'EUR'} draft={{ entries: current?.entries ?? [], wearPolicy: current?.wearPolicy ?? '' }} />
          </>
        ) : gate.needed ? (
          <PasskeyGate {...gate} returnTo={shopRoutes.prices}>{null}</PasskeyGate>
        ) : (
          <PriceEditor shopId={shopId} baseVersion={current?.version ?? null} published={publishedDraft(current)} fixedCurrency={fixedCurrency} threshold={threshold} versions={versions} previewTerms={previewTerms} />
        )}
        {fixedCurrency === null ? null : <RepairCostSection rows={repairCosts} currency={fixedCurrency} />}
      </div>
    </ShopFrame>
  )
}
