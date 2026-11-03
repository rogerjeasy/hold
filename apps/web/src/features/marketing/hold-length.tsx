import { cn } from 'cn'
import { useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'
import { holdLength } from './example-rental'

type Share = CSSProperties & Record<'--share', string>

const share = (days: number): Share => ({ '--share': `${String((days * 100) / holdLength.paypalDays)}%` })

function Bar({ label, length, days, strong }: { label: string; length: string; days: number; strong: boolean }) {
  return (
    <div>
      <p className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="font-bold">{label}</span>
        <span className="figures text-sm">{length}</span>
      </p>
      <div className="mt-2 h-5 overflow-clip rounded-full bg-muted ring-1 ring-border">
        <div style={share(days)} className={cn('h-full w-(--share) rounded-full', strong ? 'bg-primary' : 'bg-border-strong')} />
      </div>
    </div>
  )
}

// Two bars on one scale of days. The marker is a rental that outlasts a card hold and fits inside a PayPal one.
export function HoldLength() {
  const t = useTranslations('pages.paypal.length')

  return (
    <figure className="surface p-5 shadow-raised md:p-7">
      <figcaption className="label text-xs text-muted-foreground">{t('caption')}</figcaption>
      <div className="mt-5 grid gap-5">
        <Bar label={t('paypal')} length={t('days', { count: holdLength.paypalDays })} days={holdLength.paypalDays} strong />
        <Bar label={t('card')} length={t('about', { count: holdLength.cardDays })} days={holdLength.cardDays} strong={false} />
      </div>
      <div style={share(holdLength.longRentalDays)} className="mt-3 w-(--share) border-r-2 border-dashed border-primary pt-3 pr-3 text-right">
        <p className="text-[0.9375rem] text-muted-foreground">{t('rental')}</p>
      </div>
    </figure>
  )
}
