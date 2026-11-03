import { useTranslations } from 'next-intl'
import { AudienceDoors } from './audience-doors'
import { EvidenceViewer } from './evidence-viewer'
import { IntroBackdrop } from './intro-backdrop'

// The first thing anyone sees: the claim, the two ways in, and the photograph that proves it. The headline, the words
// and the photograph arrive one after another.
export function Hero() {
  const t = useTranslations('hero')

  return (
    <section className="relative isolate">
      <IntroBackdrop />
      <div className="mx-auto max-w-page px-4 pt-10 pb-6 md:px-8 md:pt-16 lg:px-10 lg:pt-20">
        <div className="grid gap-7 lg:grid-cols-[7fr_5fr] lg:items-end lg:gap-12">
          <h1 className="animate-rise text-display wrap-long-words">{t('title')}</h1>
          <div className="animate-rise [animation-delay:140ms]">
            <p className="max-w-prose text-lead text-muted-foreground">{t('lead')}</p>
            <AudienceDoors className="mt-7" />
          </div>
        </div>
        <EvidenceViewer className="mt-9 animate-rise [animation-delay:280ms] md:mt-12 lg:mt-14" />
      </div>
    </section>
  )
}
