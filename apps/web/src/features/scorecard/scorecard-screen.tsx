import type { FieldRecordMonthCounts } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { routes } from '@/lib/routes'
import { ShopFrame } from '@/features/shop/shop-frame'
import { FieldRecord } from './field-record'
import { NotMeasured } from './not-measured'
import type { WithdrawnRun } from './not-measured'
import { ScorecardFigures } from './scorecard-figures'
import type { ScorecardRun } from './scorecard-figures'

// The owner's view: the comparison's measured figures, then what this shop's own staff did with its findings.
export function ScorecardScreen({ shopName, run, months, withdrawn }: { shopName: string; run: ScorecardRun | undefined; months: readonly FieldRecordMonthCounts[]; withdrawn?: WithdrawnRun | undefined }) {
  const t = useTranslations('scorecard')
  const open = useTranslations('openScorecard')
  return (
    <ShopFrame shopName={shopName} title={t('title')}>
      <div className="grid gap-10">
        <p className="max-w-prose">{t('lead')}</p>
        {run === undefined ? <NotMeasured withdrawn={withdrawn} /> : (
          <div className="grid gap-4">
            <ScorecardFigures run={run} />
            <Link href={routes.reliability} className="inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4">{open('ownerLink')}</Link>
          </div>
        )}
        <FieldRecord months={months} />
      </div>
    </ShopFrame>
  )
}
