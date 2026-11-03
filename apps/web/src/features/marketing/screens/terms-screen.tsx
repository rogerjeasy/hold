import { useTranslations } from 'next-intl'
import { routes } from '@/lib/routes'
import { FeatureGrid } from '../feature-grid'
import { PageIntro } from '../page-intro'
import { TitledSection } from '../section'

const termKeys = ['what', 'sandbox', 'photographs', 'ai', 'shops', 'warranty', 'changes'] as const

// The terms of use of a hackathon build that runs in PayPal's sandbox, said plainly.
export function TermsScreen() {
  const t = useTranslations('pages.terms')

  return (
    <>
      <PageIntro title={t('title')} lead={t('lead')} action={{ href: routes.privacy, label: t('action') }}>
        <p className="text-muted-foreground">{t('updated')}</p>
      </PageIntro>
      <TitledSection title={t('sectionTitle')} lead={t('sectionLead')}>
        <FeatureGrid items={termKeys.map((key) => ({ title: t(`items.${key}.title`), body: t(`items.${key}.body`) }))} />
      </TitledSection>
    </>
  )
}
