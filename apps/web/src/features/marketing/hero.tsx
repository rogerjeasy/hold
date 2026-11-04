import { useTranslations } from 'next-intl'
import { AudienceDoors } from './audience-doors'
import { EvidenceViewer } from './evidence-viewer'
import { FilmStage, StageCopy } from './film-stage'
import { films } from './films'

// The first thing anyone sees: a dark stage where a bike and a scooter are scanned and a chip in the paint is found,
// with the claim and the two ways in over it; then the photograph that proves it. The words arrive one after another.
export function Hero() {
  const t = useTranslations('hero')

  return (
    <section className="relative isolate">
      <FilmStage film={films.home}>
        <StageCopy eyebrow={t('eyebrow')} title={t('title')} lead={t('lead')}>
          <AudienceDoors tone="stage" className="mt-8 max-w-xl animate-rise [animation-delay:240ms]" />
        </StageCopy>
      </FilmStage>
      <div className="mx-auto max-w-page px-4 pb-6 md:px-8 lg:px-10">
        <EvidenceViewer className="mt-6 animate-rise [animation-delay:320ms] md:mt-10 lg:mt-12" />
      </div>
    </section>
  )
}
