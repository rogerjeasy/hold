import type { ShopToday } from '@hold/db'
import { useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'

const figures = ['fees', 'released', 'claimed', 'recovered'] as const

// The month so far, from the money log and the claims.
export function MonthPanel({ month, now, clock }: { month: ShopToday['month']; now: Date; clock: ShopClock }) {
  const t = useTranslations('today.month')
  const format = useShopFormat(clock)
  const cents = { fees: month.feesCents, released: month.releasedCents, claimed: month.claimedCents, recovered: month.recoveredCents }
  const title = t('title', { month: format.month(now) })

  return (
    <Panel title={title.charAt(0).toUpperCase() + title.slice(1)}>
      <dl className="grid grid-cols-2">
        {figures.map((key) => (
          <div key={key} className="min-w-0 px-4 py-3.5 odd:border-r nth-[-n+2]:border-b md:px-5">
            <dt className="text-[0.8125rem] text-muted-foreground">{t(key)}</dt>
            <dd className="mt-1 text-xl font-extrabold tracking-tight wrap-long-words">{format.money(cents[key])}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  )
}
