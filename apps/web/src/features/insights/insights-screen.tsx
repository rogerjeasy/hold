import type { SavedInsightsDashboard } from '@hold/db'
import { useTranslations } from 'next-intl'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import { ShopFrame } from '@/features/shop/shop-frame'
import { InsightsStudio } from './insights-studio'
import type { InsightsTables } from './insights-tables'

export type InsightsScreenProps = { shopName: string; clock: ShopClock; tables: InsightsTables; saved: SavedInsightsDashboard | undefined; canDecide: boolean; licenceKey: string | undefined }

const sum = (values: readonly (number | null)[]) => values.reduce<number>((total, value) => total + (value ?? 0), 0)

// The insights dashboard (extensions.md section 12.5), for the owner and managers: AG Studio from md, where there is
// room for its canvas and the agent's panel, and on a phone the figures it opens with.
export function InsightsScreen({ shopName, clock, tables, saved, canDecide, licenceKey }: InsightsScreenProps) {
  const t = useTranslations('insights')
  const format = useShopFormat(clock)
  const empty = tables.money.length === 0 && tables.items.length === 0
  const figures = [
    { label: t('report.widgets.heldNow'), value: sum(tables.rentals.map((rental) => rental.held_now_cents)) },
    { label: t('report.widgets.toShop'), value: sum(tables.money.map((line) => line.to_shop_cents)) },
    { label: t('report.widgets.back'), value: sum(tables.money.map((line) => line.back_cents)) },
  ]
  return (
    <ShopFrame shopName={shopName} title={t('title')}>
      <div className="grid min-w-0 gap-6">
        <p className="max-w-prose text-muted-foreground">{t('lead')}</p>
        {!canDecide ? <p className="max-w-prose font-semibold">{t('onlyDeciders')}</p> : empty ? <p className="max-w-prose text-muted-foreground">{t('empty')}</p> : (
          <>
            <div className="hidden min-w-0 md:block">
              <InsightsStudio tables={tables} saved={saved} currency={clock.currency ?? 'EUR'} licenceKey={licenceKey} />
            </div>
            <div className="grid gap-3 md:hidden">
              <p className="text-sm text-muted-foreground">{t('narrow')}</p>
              <dl className="grid gap-3">
                {figures.map((figure) => (
                  <div key={figure.label} className="grid gap-1 border bg-card p-4 text-card-foreground">
                    <dt className="label text-xs text-muted-foreground">{figure.label}</dt>
                    <dd className="figures text-2xl font-semibold">{format.money(figure.value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </>
        )}
      </div>
    </ShopFrame>
  )
}
