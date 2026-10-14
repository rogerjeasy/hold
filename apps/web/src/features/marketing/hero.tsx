import { useTranslations } from 'next-intl'
import { AudienceDoors } from './audience-doors'
import { EvidenceViewer } from './evidence-viewer'

export function Hero() {
  const t = useTranslations('hero')

  return (
    <section>
      <div className="mx-auto max-w-page px-4 pt-9 md:px-8 md:pt-14 lg:px-10 lg:pt-16">
        <div className="grid gap-6 lg:grid-cols-[7fr_5fr] lg:items-end lg:gap-12">
          <h1 className="text-display wrap-long-words">{t('title')}</h1>
          <div>
            <p className="max-w-prose text-lead text-muted-foreground">{t('lead')}</p>
            <AudienceDoors className="mt-6" />
          </div>
        </div>
        <EvidenceViewer className="-mx-4 mt-7 md:-mx-8 md:mt-10 lg:-mx-10" />
      </div>
    </section>
  )
}
