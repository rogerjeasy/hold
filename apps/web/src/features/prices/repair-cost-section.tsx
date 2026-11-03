'use client'
import { formatMoney, money } from '@hold/domain'
import { Wrench } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { StatusPill } from '@/components/ui/status-pill'
import { RepairCostGrid } from './repair-cost-grid'
import type { RepairCostRow } from './repair-cost-rows'

// What repairs cost against each price (architecture.md section 9.6): a list on a phone, AG Grid from a tablet up.
export function RepairCostSection({ rows, currency }: { rows: readonly RepairCostRow[]; currency: string }) {
  const t = useTranslations('shop.prices.repairs')
  const locale = useLocale()
  if (rows.length === 0) return null
  const amount = (cents: number) => formatMoney(money(cents, currency), locale)
  return (
    <Panel title={t('title')} icon={Wrench}>
      <p className="border-b border-border/70 px-4 py-3 text-sm text-pretty text-muted-foreground md:px-5">{t('lead')}</p>
      <ul aria-label={t('title')} className="stagger md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="grid gap-1 border-b border-border/70 px-4 py-3.5 last:border-b-0">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <p className="min-w-0 font-semibold wrap-long-words">{row.description}</p>
              <p className="figures text-sm font-semibold">{amount(row.priceCents)}</p>
            </div>
            <p className="text-sm text-muted-foreground">{t('repaired', { count: row.repairs, average: amount(row.averageCents) })}</p>
            <StatusPill tone={row.standing === 'below' ? 'attention' : 'success'} className="mt-1 justify-self-start">{t(row.standing)}</StatusPill>
          </li>
        ))}
      </ul>
      <div className="hidden min-w-0 md:block"><RepairCostGrid rows={rows} currency={currency} /></div>
    </Panel>
  )
}
