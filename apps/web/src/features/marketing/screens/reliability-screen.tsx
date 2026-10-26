import { useTranslations } from 'next-intl'
import { Notice } from '@/components/ui/notice'
import { ScorecardFigures } from '@/features/scorecard/scorecard-figures'
import type { ScorecardRun } from '@/features/scorecard/scorecard-figures'
import { PageIntro } from '../page-intro'
import { Section } from '../section'

// The public scorecard: the same figures the owner sees, readable by a renter or a judge without signing in.
export function ReliabilityScreen({ run }: { run: ScorecardRun | undefined }) {
  const t = useTranslations('scorecard')
  return (
    <>
      <PageIntro title={t('title')} lead={t('lead')} />
      <Section>{run === undefined ? <Notice title={t('empty.title')} body={t('empty.body')} /> : <ScorecardFigures run={run} />}</Section>
    </>
  )
}
