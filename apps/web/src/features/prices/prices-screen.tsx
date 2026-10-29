import type { PriceListVersion, PublishedPriceList } from '@hold/db'
import { amountText, money } from '@hold/domain'
import { useFormatter, useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/routing'
import { shopRoutes } from '@/lib/routes'
import { PasskeyGate } from '@/features/shop/passkey-gate'
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
  gate: { needed: boolean; hasPasskey: boolean; email: string }
  previewTerms: Readonly<Record<Locale, TermsMessages>>
}

// The version in force as the draft the editor starts from, each amount as the shop would type it.
function publishedDraft(current: PublishedPriceList | undefined): Draft {
  if (current === undefined) return emptyDraft()
  return { rows: current.entries.map((entry, key) => ({ key, description: entry.description, category: entry.category, amount: amountText(money(entry.amountCents, current.currency)) })), wearPolicy: current.wearPolicy }
}

// The shop's prices and wear policy: what is in force, the editor for the next version, and every version with what
// changed. Publishing needs an owner or a manager, proven by a passkey; everyone else reads the versions.
export function PricesScreen({ shopName, shopId, current, versions, fixedCurrency, threshold, canPublish, gate, previewTerms }: PricesScreenProps) {
  const t = useTranslations('shop.prices')
  const format = useFormatter()
  return (
    <ShopFrame shopName={shopName} title={t('title')}>
      <div className="grid min-w-0 gap-10">
        <p className="max-w-prose text-lead text-muted-foreground">
          {current === undefined ? t('none') : t('current', { version: current.version, date: format.dateTime(current.publishedAt, { dateStyle: 'medium' }) })}
        </p>
        {!canPublish ? (
          <>
            <p className="text-muted-foreground">{t('readOnly')}</p>
            <VersionsPanel versions={versions} currency={current?.currency ?? fixedCurrency ?? 'EUR'} draft={{ entries: current?.entries ?? [], wearPolicy: current?.wearPolicy ?? '' }} />
          </>
        ) : gate.needed ? (
          <PasskeyGate {...gate} returnTo={shopRoutes.prices}>{null}</PasskeyGate>
        ) : (
          <PriceEditor shopId={shopId} baseVersion={current?.version ?? null} published={publishedDraft(current)} fixedCurrency={fixedCurrency} threshold={threshold} versions={versions} previewTerms={previewTerms} />
        )}
      </div>
    </ShopFrame>
  )
}
