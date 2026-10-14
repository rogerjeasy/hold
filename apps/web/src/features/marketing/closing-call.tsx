import { useTranslations } from 'next-intl'
import { AudienceDoors } from './audience-doors'
import { Section } from './section'

export function ClosingCall() {
  const t = useTranslations('closing')

  return (
    <Section>
      <div className="grid gap-6 lg:grid-cols-[7fr_5fr] lg:items-end lg:gap-12">
        <h2 className="text-closing text-balance wrap-long-words">{t('title')}</h2>
        <div>
          <p className="max-w-prose text-lead text-muted-foreground">{t('lead')}</p>
          <AudienceDoors className="mt-6" />
        </div>
      </div>
    </Section>
  )
}
