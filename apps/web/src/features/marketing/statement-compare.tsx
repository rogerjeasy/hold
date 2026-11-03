import { cn } from 'cn'
import { useFormatter, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { exampleRental } from './example-rental'
import { useExampleMoney } from './use-example-money'

type Row = { when: string; what: string; amount: string; quiet?: boolean }

function Statement({ label, rows, out, outLabel, foot, emphasis }: { label: string; rows: readonly Row[]; out: string; outLabel: string; foot: ReactNode; emphasis: boolean }) {
  return (
    <li className={cn('surface relative flex flex-col overflow-clip', emphasis && 'shadow-raised ring-1 ring-primary/30')}>
      <h3 className={cn('label flex items-center gap-2 border-b border-border/70 px-5 py-3.5 text-xs md:px-6', emphasis ? 'bg-primary/6 text-primary' : 'bg-muted/60 text-muted-foreground')}>
        <span aria-hidden="true" className={cn('size-1.5 rounded-full', emphasis ? 'bg-primary' : 'bg-border-strong')} />
        {label}
      </h3>
      <ul role="list" className="px-5 md:px-6">
        {rows.map((row) => (
          <li key={row.what} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b border-border/70 py-3.5">
            <span className="figures col-span-2 text-[0.8125rem] text-muted-foreground">{row.when}</span>
            <span className="min-w-0 text-[1.0625rem]">{row.what}</span>
            <span className={cn('figures self-end text-right font-medium', row.quiet && 'text-muted-foreground')}>{row.amount}</span>
          </li>
        ))}
      </ul>
      <p className="px-5 pt-4 pb-6 text-[0.9375rem] text-muted-foreground md:px-6">{foot}</p>
      <div className={cn('mt-auto flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-t border-border/70 px-5 py-5 md:px-6', emphasis && 'bg-primary/4')}>
        <p className="max-w-40 text-[0.9375rem] text-muted-foreground">{outLabel}</p>
        <p className="text-headline">{out}</p>
      </div>
    </li>
  )
}

// The same rental as two account statements. With a deposit the money leaves. With a hold it never does.
export function StatementCompare() {
  const t = useTranslations('pages.forRenters.statement')
  const format = useFormatter()
  const money = useExampleMoney()
  const day = (date: Date) => format.dateTime(date, { month: 'short', day: 'numeric' })
  const amount = money(exampleRental.reservedCents)

  return (
    <ul role="list" className="stagger grid gap-4 md:grid-cols-2 lg:gap-6">
      <Statement
        label={t('deposit.label')}
        emphasis={false}
        rows={[
          { when: day(exampleRental.handoverAt), what: t('deposit.charged'), amount: `−${amount}` },
          { when: day(exampleRental.returnAt), what: t('deposit.returned'), amount: t('deposit.waiting'), quiet: true },
          { when: t('later'), what: t('deposit.refunded'), amount: `+${amount}` },
        ]}
        out={amount}
        outLabel={t('out')}
        foot={t('deposit.foot')}
      />
      <Statement
        label={t('hold.label')}
        emphasis
        rows={[
          { when: day(exampleRental.handoverAt), what: t('hold.placed'), amount: t('hold.reserved', { amount }), quiet: true },
          { when: day(exampleRental.returnAt), what: t('hold.released'), amount: t('hold.taken', { amount: money(0) }) },
        ]}
        out={money(0)}
        outLabel={t('out')}
        foot={t('hold.foot')}
      />
    </ul>
  )
}
