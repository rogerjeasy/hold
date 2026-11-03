import { HOLD_VALIDITY_DAYS } from '@hold/domain'
import { Info, Lock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { HoldSummary } from './decisions'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel } from '@/components/ui/panel'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'

// Assured holds read as safe, the rest as the paper's ink, and the ones ending as the accent: the legend names each.
const standings = [
  { key: 'assured', swatch: 'bg-success' },
  { key: 'valid', swatch: 'bg-foreground/35' },
  { key: 'ending', swatch: 'bg-primary' },
] as const

// What the shop holds on its renters' PayPal accounts, and how much of it is near the end of PayPal's clock.
export function HoldsPanel({ holds, clock }: { holds: HoldSummary; clock: ShopClock }) {
  const t = useTranslations('today.holds')
  const format = useShopFormat(clock)

  return (
    <Panel title={t('title')} icon={Lock}>
      {holds.count === 0 ? (
        <EmptyState icon={Lock} title={t('empty')} body={t('note', { max: HOLD_VALIDITY_DAYS })} />
      ) : (
        <div className="p-4 md:p-5">
          <p className="text-figure tabular-nums wrap-long-words">{format.money(holds.heldCents)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('total', { count: holds.count })}</p>
          <div aria-hidden="true" className="mt-5 flex h-2.5 animate-fade gap-1 overflow-hidden rounded-full">
            {standings.map(({ key, swatch }) => (holds[key] === 0 ? null : <span key={key} className={`rounded-full ${swatch}`} style={{ flexGrow: holds[key] }} />))}
          </div>
          <ul className="mt-4 grid gap-1.5 text-[0.9375rem]">
            {standings.map(({ key, swatch }) => (
              <li key={key} className="flex min-h-8 items-center gap-2.5 rounded-lg px-2 -mx-2 hover:bg-muted/50">
                <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${swatch}`} />
                <span className="min-w-0 flex-1 wrap-long-words">{t(key)}</span>
                <span className="figures font-semibold">{holds[key]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex gap-2 rounded-xl bg-muted/60 p-3 text-[0.8125rem] text-muted-foreground">
            <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            {t('note', { max: HOLD_VALIDITY_DAYS })}
          </p>
        </div>
      )}
    </Panel>
  )
}
