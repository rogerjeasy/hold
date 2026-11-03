import { BookOpen, Camera, Ban, Gauge, ListChecks, UserCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Notice } from '@/components/ui/notice'
import { Link } from '@/i18n/navigation'
import { routes } from '@/lib/routes'
import { RECORDED_INVESTIGATION } from '@/features/operations/recorded-investigation'
import { RecordedInvestigationView } from '@/features/operations/recorded-investigation-view'
import { AiBoundaries } from '../ai-boundaries'
import { ClosingCall } from '../closing-call'
import { ComparisonPipeline } from '../comparison-pipeline'
import { FeatureGrid } from '../feature-grid'
import { FindingCards } from '../finding-cards'
import { PageIntro } from '../page-intro'
import { SplitSection, TitledSection } from '../section'
import { ToolTiers } from '../tool-tiers'

const limits = [
  { key: 'confidence', icon: Gauge },
  { key: 'retake', icon: Camera },
  { key: 'defers', icon: UserCheck },
] as const
const accuracyKeys = ['counts', 'renter', 'worse'] as const
const operations = [
  { key: 'read', icon: BookOpen },
  { key: 'propose', icon: ListChecks },
  { key: 'never', icon: Ban },
] as const

export function AiScreen() {
  const t = useTranslations('pages.ai')
  const scorecard = useTranslations('scorecard')

  return (
    <>
      <PageIntro title={t('title')} lead={t('lead')} />
      <TitledSection title={t('pipeline.title')} lead={t('pipeline.lead')}>
        <ComparisonPipeline />
      </TitledSection>
      <AiBoundaries hiddenHeading={t('listsHeading')} />
      <TitledSection title={t('findings.title')} lead={t('findings.lead')}>
        <FindingCards />
      </TitledSection>
      <TitledSection title={t('limits.title')} lead={t('limits.lead')}>
        <FeatureGrid items={limits.map(({ key, icon }) => ({ title: t(`limits.items.${key}.title`), body: t(`limits.items.${key}.body`), icon }))} />
      </TitledSection>
      <SplitSection
        title={t('accuracy.title')}
        lead={t('accuracy.lead')}
        aside={
          <FeatureGrid
            columns="one"
            items={accuracyKeys.map((key) => ({ title: t(`accuracy.items.${key}.title`), body: t(`accuracy.items.${key}.body`) }))}
          />
        }
      >
        <div className="grid gap-4">
          <Notice title={t('accuracy.status.title')} body={t('accuracy.status.body')} />
          <Link href={routes.reliability} className="inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4">{scorecard('publicLink')}</Link>
        </div>
      </SplitSection>
      <TitledSection title={t('operations.title')} lead={t('operations.lead')} tone="band">
        <FeatureGrid tone="band" items={operations.map(({ key, icon }) => ({ title: t(`operations.items.${key}.title`), body: t(`operations.items.${key}.body`), icon }))} />
      </TitledSection>
      {RECORDED_INVESTIGATION === undefined ? null : (
        <TitledSection title={t('queue.title')} lead={t('queue.lead')}>
          <RecordedInvestigationView run={RECORDED_INVESTIGATION} />
        </TitledSection>
      )}
      <SplitSection title={t('agents.title')} lead={t('agents.lead')} aside={<ToolTiers />} asideFirst />
      <ClosingCall />
    </>
  )
}
