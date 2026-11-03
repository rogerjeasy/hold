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
    <section aria-labelledby={titleId} className="surface grid min-w-0 gap-4 p-4 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={titleId} className="text-[1.0625rem] font-extrabold tracking-tight">
          {t('totals')}
        </h2>
        <span className="text-sm text-muted-foreground">{t('days', { count: days })}</span>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-border/70 p-4">
          <dt className="label text-xs text-muted-foreground">{t('fee')}</dt>
          <dd className="mt-1.5 text-figure tabular-nums wrap-long-words">{formatMoney(fee, locale)}</dd>
          <dd className="mt-1 text-[0.8125rem] text-muted-foreground">{t('feeNote')}</dd>
        </div>
        {/* The hold in the wallet card's colours, as the renter's own page shows it: reserved, never added to the fee. */}
        <div className="min-w-0 rounded-xl bg-band p-4 text-band-foreground">
          <dt className="label text-xs text-band-muted">{t('hold')}</dt>
          <dd className="mt-1.5 text-figure tabular-nums wrap-long-words">{formatMoney(hold, locale)}</dd>
          <dd className="mt-1 text-[0.8125rem] text-band-muted">{t('holdNote')}</dd>
        </div>
      </dl>
    </section>
  )
}
