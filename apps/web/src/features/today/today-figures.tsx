import type { ShopToday } from '@hold/db'
import { cn } from 'cn'
import { useTranslations } from 'next-intl'
import { useId } from 'react'
import type { HoldSummary } from './decisions'
import type { ShopClock } from './use-shop-format'
import { useShopFormat } from './use-shop-format'

function Figure({ label, value, note, urgent = false }: { label: string; value: string; note: string; urgent?: boolean }) {
  return (
    <div className="min-w-0 p-4 odd:border-r max-xl:nth-[-n+2]:border-b md:p-5 xl:not-last:border-r">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-figure wrap-long-words">
        {/* The colour sits on its own element: merged with the size, cn would keep only one of them. */}
        <span className={cn(urgent && 'text-primary')}>{value}</span>
      </dd>
      <dd className="mt-1.5 text-[0.8125rem] text-muted-foreground">{note}</dd>
    </div>
  )
}

// The four numbers an owner looks at first: what is out, what comes back, what is held and what waits on them.
export function TodayFigures({ today, holds, clock }: { today: ShopToday; holds: HoldSummary; clock: ShopClock }) {
  const t = useTranslations('today.figures')
  const format = useShopFormat(clock)
  const titleId = useId()
  const claimsCents = today.claimsWaiting.reduce((sum, claim) => sum + claim.totalCents, 0)
  const toDecide = today.claimsWaiting.length

  return (
    <section aria-labelledby={titleId}>
      <h2 id={titleId} className="sr-only">
        {t('label')}
      </h2>
      <dl className="grid grid-cols-2 border bg-card text-card-foreground xl:grid-cols-4">
        <Figure label={t('out')} value={String(today.itemsOut)} note={t('outNote', { rentals: today.rentalsOut })} />
        <Figure label={t('due')} value={String(today.dueBackToday)} note={t('dueNote', { late: today.late.length })} />
        <Figure label={t('held')} value={format.money(holds.heldCents)} note={t('heldNote', { count: holds.count })} />
        <Figure label={t('claims')} value={String(toDecide)} note={toDecide === 0 ? t('claimsNoteNone') : t('claimsNote', { amount: format.money(claimsCents) })} urgent={toDecide > 0} />
      </dl>
    </section>
  )
}
