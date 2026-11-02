import type { EvaluatedCase, TrendRun } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { OpenScorecard } from '@/features/open-scorecard/open-scorecard'
import { NotMeasured } from '@/features/scorecard/not-measured'
import type { WithdrawnRun } from '@/features/scorecard/not-measured'
import { ScorecardFigures } from '@/features/scorecard/scorecard-figures'
import type { ScorecardRun } from '@/features/scorecard/scorecard-figures'
import { PageIntro } from '../page-intro'
import { Section } from '../section'

type ReliabilityScreenProps = { run: ScorecardRun | undefined; cases: readonly EvaluatedCase[]; history: readonly TrendRun[]; withdrawn?: WithdrawnRun | undefined }

// The public scorecard: the same figures the owner sees, readable by a renter or a judge without signing in, then
// every pair they were counted from, case by case (extensions.md section 5.5).
export function ReliabilityScreen({ run, cases, history, withdrawn }: ReliabilityScreenProps) {
  const t = useTranslations('scorecard')
  return (
    <>
      <PageIntro title={t('title')} lead={t('lead')} />
      <Section>{run === undefined ? <NotMeasured withdrawn={withdrawn} /> : <ScorecardFigures run={run} />}</Section>
      {run === undefined || cases.length === 0 ? null : <Section><OpenScorecard cases={cases} history={history} /></Section>}
    </>
  )
}
