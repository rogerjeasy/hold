import type { Money } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { useId } from 'react'
import { formatMoney } from '@/lib/money'

// The two amounts of a booking, kept apart: the fee, paid now, and the hold, reserved at pickup and not a charge.
export function BookingTotals({ days, fee, hold }: { days: number; fee: Money; hold: Money }) {
  const t = useTranslations('booking')
  const locale = useLocale()
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="grid gap-4 border bg-card p-4 text-card-foreground md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={titleId} className="text-[1.0625rem] font-extrabold tracking-tight">
          {t('totals')}
        </h2>
        <span className="text-sm text-muted-foreground">{t('days', { count: days })}</span>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-sm text-muted-foreground">{t('fee')}</dt>
          <dd className="mt-1 text-figure">{formatMoney(fee, locale)}</dd>
          <dd className="mt-1 text-[0.8125rem] text-muted-foreground">{t('feeNote')}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm text-muted-foreground">{t('hold')}</dt>
          <dd className="mt-1 text-figure">{formatMoney(hold, locale)}</dd>
          <dd className="mt-1 text-[0.8125rem] text-muted-foreground">{t('holdNote')}</dd>
        </div>
      </dl>
    </section>
  )
}
