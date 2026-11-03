import { CircleCheck, Gavel, Link2, ListOrdered, MinusCircle, Scale, Timer, TrendingDown } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { Notice } from '@/components/ui/notice'
import { routes } from '@/lib/routes'
import { OfferLadder } from '@/features/negotiation/offer-ladder'
import { RECORDED_RUN } from '@/features/negotiation/recorded-run'
import { RecordedRunView } from '@/features/negotiation/recorded-run-view'
import { ClosingCall } from '../closing-call'
import { FeatureGrid } from '../feature-grid'
import { PageIntro } from '../page-intro'
import { SplitSection, TitledSection } from '../section'

// What packages/domain/src/referee.ts refuses, in the order it checks.
const refusals = [
  { key: 'lines', icon: ListOrdered },
  { key: 'price', icon: MinusCircle },
  { key: 'ground', icon: Gavel },
  { key: 'gap', icon: TrendingDown },
  { key: 'limit', icon: Scale },
  { key: 'time', icon: Timer },
] as const
const limitKeys = ['shop', 'renter', 'words'] as const
const afterSteps = [
  { key: 'lower', icon: TrendingDown },
  { key: 'confirm', icon: CircleCheck },
  { key: 'chain', icon: Link2 },
] as const

// The advocates of a contested claim, readable by anyone without signing in: the recorded live run first, then the
// rules that bound it (extensions.md section 9).
export function AdvocatesScreen() {
  const t = useTranslations('pages.advocates')
  const format = useFormatter()

  return (
    <>
      <PageIntro
        title={t('title')}
        lead={t('lead')}
        action={{ href: routes.demo, label: t('action') }}
        secondaryAction={{ href: routes.ai, label: t('secondary') }}
      />
      <TitledSection title={t('run.title')} lead={t('run.lead')}>
        {RECORDED_RUN === undefined ? (
          <Notice title={t('run.noneTitle')} body={t('run.noneBody')} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[5fr_7fr] lg:items-start lg:gap-10">
            <div className="lg:sticky lg:top-28">
              <OfferLadder transcript={RECORDED_RUN.transcript} caption={t('run.caption', { date: format.dateTime(RECORDED_RUN.recordedAt, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) })} />
            </div>
            <RecordedRunView run={RECORDED_RUN} />
          </div>
        )}
      </TitledSection>
      <TitledSection title={t('referee.title')} lead={t('referee.lead')} tone="band">
        <FeatureGrid tone="band" items={refusals.map(({ key, icon }) => ({ title: t(`referee.items.${key}.title`), body: t(`referee.items.${key}.body`), icon }))} />
      </TitledSection>
      <SplitSection
        title={t('limits.title')}
        lead={t('limits.lead')}
        aside={<FeatureGrid columns="one" items={limitKeys.map((key) => ({ title: t(`limits.items.${key}.title`), body: t(`limits.items.${key}.body`) }))} />}
      />
      <TitledSection title={t('after.title')} lead={t('after.lead')}>
        <FeatureGrid items={afterSteps.map(({ key, icon }) => ({ title: t(`after.items.${key}.title`), body: t(`after.items.${key}.body`), icon }))} />
      </TitledSection>
      <ClosingCall />
    </>
  )
}
