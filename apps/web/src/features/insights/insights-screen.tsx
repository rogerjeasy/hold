import type { SavedInsightsDashboard } from '@hold/db'
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, ChartNoAxesCombined, Lock, LockKeyhole } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import { ShopFrame } from '@/features/shop/shop-frame'
import { Link } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'
import { InsightsStudio } from './insights-studio'
import type { InsightsTables } from './insights-tables'

export type InsightsScreenProps = { shopName: string; clock: ShopClock; tables: InsightsTables; saved: SavedInsightsDashboard | undefined; canDecide: boolean; licenceKey: string | undefined }

const sum = (values: readonly (number | null)[]) => values.reduce<number>((total, value) => total + (value ?? 0), 0)

// The insights dashboard (extensions.md section 12.5), for the owner and managers: AG Studio from md, where there is
// room for its canvas and the agent's panel, and on a phone the figures it opens with. Anyone else is told who opens
// it and pointed to the money ledger, which every staff member reads.
export function InsightsScreen({ shopName, clock, tables, saved, canDecide, licenceKey }: InsightsScreenProps) {
  const t = useTranslations('insights')
  const format = useShopFormat(clock)
  const empty = tables.money.length === 0 && tables.items.length === 0
  const figures = [
    { label: t('report.widgets.heldNow'), icon: Lock, value: sum(tables.rentals.map((rental) => rental.held_now_cents)) },
    { label: t('report.widgets.toShop'), icon: ArrowDownToLine, value: sum(tables.money.map((line) => line.to_shop_cents)) },
    { label: t('report.widgets.back'), icon: ArrowUpFromLine, value: sum(tables.money.map((line) => line.back_cents)) },
  ]
  return (
    <ShopFrame shopName={shopName} title={t('title')} description={t('lead')}>
      {!canDecide ? (
        <div className="surface max-w-3xl overflow-clip">
          <EmptyState
            icon={LockKeyhole}
            title={t('onlyDeciders')}
            body={t('onlyDecidersBody')}
            action={
              <Link href={shopRoutes.money} className={buttonVariants({ variant: 'outline' })}>
                {t('openMoney')}
                <ArrowRight aria-hidden="true" />
              </Link>
            }
          />
        </div>
      ) : empty ? (
        <div className="surface max-w-3xl overflow-clip">
          <EmptyState icon={ChartNoAxesCombined} title={t('emptyTitle')} body={t('empty')} />
        </div>
      ) : (
        <>
          <div className="hidden min-w-0 md:block">
            <InsightsStudio tables={tables} saved={saved} currency={clock.currency ?? 'EUR'} licenceKey={licenceKey} />
          </div>
          <div className="grid gap-4 md:hidden">
            <p className="text-sm text-muted-foreground">{t('narrow')}</p>
            <dl className="grid stagger gap-3">
              {figures.map((figure) => <StatCard key={figure.label} icon={figure.icon} label={figure.label} value={format.money(figure.value)} />)}
            </dl>
          </div>
        </>
      )}
    </ShopFrame>
  )
}
