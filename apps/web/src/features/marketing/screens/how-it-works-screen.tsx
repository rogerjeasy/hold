import { FolderCheck, MessageSquareReply, MessagesSquare, Scale } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AdvocatesPointer } from '../advocates-pointer'
import { ClosingCall } from '../closing-call'
import { exampleRental } from '../example-rental'
import { Faq, type FaqKey } from '../faq'
import { FeatureGrid } from '../feature-grid'
import { FilmStage, StageCopy } from '../film-stage'
import { films, HOW_IT_WORKS_CHAPTERS } from '../films'
import { FigureStrip } from '../figure-strip'
import { MomentList } from '../moment-list'
import { TitledSection, UntitledSection } from '../section'
import { useExampleMoney } from '../use-example-money'

const contested = [
  { key: 'reply', icon: MessageSquareReply },
  { key: 'advocates', icon: MessagesSquare },
  { key: 'owner', icon: Scale },
  { key: 'record', icon: FolderCheck },
] as const

const questions: readonly FaqKey[] = ['charge', 'length', 'beyond', 'app', 'dark', 'wear']

export function HowItWorksScreen() {
  const t = useTranslations('pages.howItWorks')
  const steps = useTranslations('steps.items')
  const money = useExampleMoney()
  // The film's chapters: the booking, then the four moments named as the steps below name them, each with who acts.
  const chapters = HOW_IT_WORKS_CHAPTERS.map(({ key, start }) => ({ key, start, title: key === 'book' ? t('film.book') : steps(`${key}.title`), who: t(`film.who.${key}`) }))

  return (
    <>
      <section className="relative isolate">
        <FilmStage film={films.howItWorks} chapters={chapters}>
          <StageCopy eyebrow={t('film.eyebrow')} title={t('title')} lead={t('lead')} size="headline" />
        </FilmStage>
        <div className="mx-auto max-w-page animate-rise px-4 pt-8 pb-4 [animation-delay:240ms] md:px-8 md:pt-12 md:pb-6 lg:px-10">
          <FigureStrip
            figures={[
              { value: money(exampleRental.reservedCents), label: t('figures.reserved') },
              { value: String(exampleRental.photographCount), label: t('figures.photographs') },
              { value: String(exampleRental.handoverSeconds), label: t('figures.seconds') },
              { value: money(0), label: t('figures.charged') },
            ]}
          />
        </div>
      </section>
      <UntitledSection hiddenTitle={t('stepsHeading')}>
        <MomentList />
      </UntitledSection>
      <TitledSection title={t('contested.title')} lead={t('contested.lead')} tone="band">
        <div className="grid gap-6">
          <FeatureGrid
            tone="band"
            columns="four"
            items={contested.map(({ key, icon }) => ({
              title: t(`contested.items.${key}.title`),
              body: t(`contested.items.${key}.body`),
              icon,
            }))}
          />
          <AdvocatesPointer tone="band" />
        </div>
      </TitledSection>
      <Faq title={t('faq.title')} lead={t('faq.lead')} questions={questions} />
      <ClosingCall />
    </>
  )
}
