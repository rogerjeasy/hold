import type { ShopToday } from '@hold/db'
import { useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'

const figures = ['fees', 'released', 'claimed', 'recovered'] as const

// Minutes and seconds, as a counter reads a stopwatch.
const clockTime = (seconds: number) => `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`

// The month so far, from the money log and the claims, and how long the counter takes, each time with its count.
export function MonthPanel({ month, routine, now, clock }: { month: ShopToday['month']; routine: ShopToday['routine']; now: Date; clock: ShopClock }) {
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
      <ul className="grid gap-1 border-t px-4 py-3.5 text-[0.9375rem] md:px-5">
        {routine.handover.medianSeconds === null && routine.return.medianSeconds === null ? (
          <li className="text-muted-foreground">{t('routineNone')}</li>
        ) : (
          <>
            <li>{routine.handover.medianSeconds === null ? t('routineHandoverNone') : t('routineHandover', { time: clockTime(routine.handover.medianSeconds), count: routine.handover.count })}</li>
            <li>{routine.return.medianSeconds === null ? t('routineReturnNone') : t('routineReturn', { time: clockTime(routine.return.medianSeconds), count: routine.return.count })}</li>
          </>
        )}
      </ul>
    </Panel>
  )
}
