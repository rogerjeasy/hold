import { useTranslations } from 'next-intl'
import { TitledSection } from './section'
import { StepList } from './step-list'

export function HowItWorks() {
  const t = useTranslations('steps')

  return (
    <TitledSection title={t('title')} lead={t('lead')}>
      <StepList />
    </TitledSection>
  )
}
