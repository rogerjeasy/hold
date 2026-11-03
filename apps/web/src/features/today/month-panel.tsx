import type { ShopToday } from '@hold/db'
import { CalendarRange, Timer } from 'lucide-react'
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
    <Panel title={title.charAt(0).toUpperCase() + title.slice(1)} icon={CalendarRange}>
      <dl className="grid grid-cols-2 gap-2 p-3 md:p-4">
        {figures.map((key) => (
          <div key={key} className="min-w-0 rounded-xl bg-muted/55 px-3.5 py-3">
            <dt className="text-[0.8125rem] text-muted-foreground wrap-long-words">{t(key)}</dt>
            <dd className="mt-1 text-xl font-extrabold tracking-tight tabular-nums wrap-long-words">{format.money(cents[key])}</dd>
          </div>
        ))}
      </dl>
      <ul className="grid gap-1.5 border-t border-border/70 px-4 py-3.5 text-[0.9375rem] md:px-5">
        {routine.handover.medianSeconds === null && routine.return.medianSeconds === null ? (
          <li className="flex gap-2 text-muted-foreground">
            <Timer aria-hidden="true" className="mt-1 size-4 shrink-0" />
            {t('routineNone')}
          </li>
        ) : (
          <>
            <li className="flex gap-2">
              <Timer aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" />
              {routine.handover.medianSeconds === null ? t('routineHandoverNone') : t('routineHandover', { time: clockTime(routine.handover.medianSeconds), count: routine.handover.count })}
            </li>
            <li className="flex gap-2">
              <Timer aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" />
              {routine.return.medianSeconds === null ? t('routineReturnNone') : t('routineReturn', { time: clockTime(routine.return.medianSeconds), count: routine.return.count })}
            </li>
          </>
        )}
      </ul>
    </Panel>
  )
}
