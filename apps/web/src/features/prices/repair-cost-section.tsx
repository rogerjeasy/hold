'use client'
import { formatMoney, money } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { RepairCostGrid } from './repair-cost-grid'
import type { RepairCostRow } from './repair-cost-rows'

// What repairs cost against each price (architecture.md section 9.6): a list on a phone, AG Grid from a tablet up.
export function RepairCostSection({ rows, currency }: { rows: readonly RepairCostRow[]; currency: string }) {
  const t = useTranslations('shop.prices.repairs')
  const locale = useLocale()
  if (rows.length === 0) return null
  const amount = (cents: number) => formatMoney(money(cents, currency), locale)
  return (
    <section aria-labelledby="repair-costs" className="grid min-w-0 gap-4">
      <div className="grid gap-2">
        <h2 id="repair-costs" className="text-[1.375rem] leading-tight font-extrabold tracking-tight">{t('title')}</h2>
        <p className="max-w-prose text-pretty text-muted-foreground">{t('lead')}</p>
      </div>
      <ul aria-label={t('title')} className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="grid gap-1 border bg-card p-4">
            <p className="font-semibold wrap-long-words">{row.description}</p>
            <p className="figures text-sm">{amount(row.priceCents)}</p>
            <p className="text-sm text-muted-foreground">{t('repaired', { count: row.repairs, average: amount(row.averageCents) })}</p>
            <p className={`justify-self-start border px-2 py-0.5 text-xs font-semibold uppercase ${row.standing === 'below' ? 'border-warning text-warning' : 'border-success text-success'}`}>{t(row.standing)}</p>
          </li>
        ))}
      </ul>
      <div className="hidden min-w-0 md:block"><RepairCostGrid rows={rows} currency={currency} /></div>
    </section>
  )
}
