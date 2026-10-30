'use client'
import type { ItemRepair } from '@hold/db'
import { useTranslations } from 'next-intl'
import { Notice } from '@/components/ui/notice'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'

// A closed repair: what was done to each line, what it cost against what was claimed, and who closed it when.
export function RepairDone({ repair, clock }: { repair: ItemRepair; clock: ShopClock }) {
  const t = useTranslations('repairs')
  const format = useShopFormat(clock)
  const claimed = repair.lines.reduce((total, line) => total + (line.claimedCents ?? 0), 0)
  const date = repair.closedAt === null ? '' : format.day(repair.closedAt)
  return (
    <div className="grid gap-4">
      <Notice tone="success" title={t('page.doneTitle')} body={t('page.doneBody')} />
      <ul className="grid gap-1">
        {repair.lines.map((line) => <li key={line.id} className="flex flex-wrap gap-x-2"><span className="font-semibold wrap-long-words">{line.description}</span><span className="text-muted-foreground">· {t(`page.${line.outcome ?? 'left'}`)}</span></li>)}
      </ul>
      <dl className="grid grid-cols-[auto_auto] justify-start gap-x-6 gap-y-1">
        <dt className="text-muted-foreground">{t('costLabel')}</dt><dd className="figures font-semibold">{format.money(repair.costCents ?? 0)}</dd>
        {claimed > 0 ? <><dt className="text-muted-foreground">{t('claimedLabel')}</dt><dd className="figures font-semibold">{format.money(claimed)}</dd></> : null}
      </dl>
      <p className="text-sm text-muted-foreground">{repair.closer === null ? t('doneUnnamed', { date }) : t('doneBy', { name: repair.closer, date })}</p>
      {repair.note === null ? null : <p className="whitespace-pre-wrap wrap-long-words">{repair.note}</p>}
    </div>
  )
}
