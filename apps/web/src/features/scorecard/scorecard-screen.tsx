import type { FieldRecordMonthCounts } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { Notice } from '@/components/ui/notice'
import { ShopFrame } from '@/features/shop/shop-frame'
import { FieldRecord } from './field-record'
import { ScorecardFigures } from './scorecard-figures'
import type { ScorecardRun } from './scorecard-figures'

// The owner's view: the comparison's measured figures, then what this shop's own staff did with its findings.
export function ScorecardScreen({ shopName, run, months }: { shopName: string; run: ScorecardRun | undefined; months: readonly FieldRecordMonthCounts[] }) {
  const t = useTranslations('scorecard')
  return (
    <ShopFrame shopName={shopName} title={t('title')}>
      <div className="grid gap-10">
        <p className="max-w-prose">{t('lead')}</p>
        {run === undefined ? <Notice title={t('empty.title')} body={t('empty.body')} /> : <ScorecardFigures run={run} />}
        <FieldRecord months={months} />
      </div>
    </ShopFrame>
  )
}
