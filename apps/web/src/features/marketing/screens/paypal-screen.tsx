import { BadgeCheck, BookCheck, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { CapabilityTable, capabilityKeys } from '../capability-table'
import { AdvocatesPointer } from '../advocates-pointer'
import { ClosingCall } from '../closing-call'
import { FeatureGrid } from '../feature-grid'
import { HoldLength } from '../hold-length'
import { HoldLifecycle } from '../hold-lifecycle'
import { PageIntro } from '../page-intro'
import { SplitSection, TitledSection } from '../section'

const advantageKeys = ['days', 'wallet', 'truth'] as const

const truthSteps = [
  { key: 'verify', icon: BadgeCheck },
  { key: 'read', icon: RefreshCw },
  { key: 'log', icon: BookCheck },
] as const

export function PaypalScreen() {
  const t = useTranslations('pages.paypal')

  return (
    <>
      <PageIntro title={t('title')} lead={t('lead')} />
      <TitledSection title={t('lifecycle.title')} lead={t('lifecycle.lead')} tone="band">
        <HoldLifecycle />
      </TitledSection>
      <TitledSection title={t('table.title')} lead={t('table.lead')}>
        <CapabilityTable rows={capabilityKeys} />
      </TitledSection>
      <SplitSection title={t('advantages.title')} lead={t('advantages.lead')} aside={<HoldLength />}>
        <FeatureGrid
          columns="one"
          items={advantageKeys.map((key) => ({
            title: t(`advantages.items.${key}.title`),
            body: t(`advantages.items.${key}.body`),
          }))}
        />
      </SplitSection>
      <TitledSection title={t('truth.title')} lead={t('truth.lead')}>
        <FeatureGrid
          items={truthSteps.map(({ key, icon }) => ({
            title: t(`truth.items.${key}.title`),
            body: t(`truth.items.${key}.body`),
            icon,
          }))}
        />
      </TitledSection>
      <TitledSection title={t('agreement.title')} lead={t('agreement.lead')}>
        <AdvocatesPointer />
      </TitledSection>
      <ClosingCall />
    </>
  )
}
