import type { PriceCategory } from '@hold/domain'
import { money } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { formatMoney } from '@/lib/money'

type TermsViewProps = {
  currency: string
  prices: readonly { readonly description: string; readonly category: PriceCategory; readonly amountCents: number }[]
  wearPolicy: string
}

// The shop's damage prices and its wear policy, as a renter reads them before agreeing to them.
export function TermsView({ currency, prices, wearPolicy }: TermsViewProps) {
  const t = useTranslations('renter')
  const locale = useLocale()
  return (
    <div className="grid gap-6">
      <Panel title={t('prices')}>
        <p className="border-b px-4 py-3 text-sm text-muted-foreground md:px-5">{t('pricesLead')}</p>
        <ul>
          {prices.map((price) => (
            <li key={price.description} className="flex items-baseline justify-between gap-4 border-b px-4 py-3 last:border-b-0 md:px-5">
              <span className="min-w-0 wrap-long-words">{price.description}</span>
              <span className="figures shrink-0 font-semibold">{formatMoney(money(price.amountCents, currency), locale)}</span>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title={t('wear')}>
        <p className="border-b px-4 py-3 text-sm text-muted-foreground md:px-5">{t('wearLead')}</p>
        <p className="px-4 py-4 whitespace-pre-line wrap-long-words md:px-5">{wearPolicy}</p>
      </Panel>
    </div>
  )
}
