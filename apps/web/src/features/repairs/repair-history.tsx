'use client'
import type { ItemRepair } from '@hold/db'
import { History } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'

// Repairs done, newest first: what each cost against what its damage was claimed for.
export function RepairHistory({ repairs, clock }: { repairs: readonly ItemRepair[]; clock: ShopClock }) {
  const t = useTranslations('repairs')
  const format = useShopFormat(clock)
  return (
    <Panel title={t('historyTitle')} icon={History}>
      <ul className="divide-y divide-border/70">
        {repairs.map((repair) => {
          const claimed = repair.lines.reduce((total, line) => total + (line.claimedCents ?? 0), 0)
          const date = repair.closedAt === null ? '' : format.day(repair.closedAt)
          return (
            <li key={repair.id} className="grid gap-1.5 px-4 py-4 md:px-5">
              <p className="font-semibold wrap-long-words">{repair.lines.map((line) => line.description).join(' · ')}</p>
              <p className="text-sm text-muted-foreground">{repair.closer === null ? t('doneUnnamed', { date }) : t('doneBy', { name: repair.closer, date })}</p>
              <dl className="grid grid-cols-[auto_auto] justify-start gap-x-4 text-sm">
                <dt className="text-muted-foreground">{t('costLabel')}</dt><dd className="figures font-semibold">{format.money(repair.costCents ?? 0)}</dd>
                {claimed > 0 ? <><dt className="text-muted-foreground">{t('claimedLabel')}</dt><dd className="figures font-semibold">{format.money(claimed)}</dd></> : null}
              </dl>
              {repair.note === null ? null : <p className="text-sm whitespace-pre-wrap wrap-long-words">{repair.note}</p>}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
