import { FolderCheck, MessageSquareReply, MessagesSquare, Scale } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AdvocatesPointer } from '../advocates-pointer'
import { ClosingCall } from '../closing-call'
import { exampleRental } from '../example-rental'
import { Faq, type FaqKey } from '../faq'
import { FeatureGrid } from '../feature-grid'
import { FigureStrip } from '../figure-strip'
import { MomentList } from '../moment-list'
import { PageIntro } from '../page-intro'
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
  const money = useExampleMoney()

  return (
    <>
      <PageIntro title={t('title')} lead={t('lead')}>
        <FigureStrip
          figures={[
            { value: money(exampleRental.reservedCents), label: t('figures.reserved') },
            { value: String(exampleRental.photographCount), label: t('figures.photographs') },
            { value: String(exampleRental.handoverSeconds), label: t('figures.seconds') },
            { value: money(0), label: t('figures.charged') },
          ]}
        />
      </PageIntro>
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
