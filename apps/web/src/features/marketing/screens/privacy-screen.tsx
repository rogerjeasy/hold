import { BACKUP_KEPT_DAYS, EVIDENCE_KEPT_DAYS, EVIDENCE_LOCK_DAYS } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { routes } from '@/lib/routes'
import { FeatureGrid } from '../feature-grid'
import { PageIntro } from '../page-intro'
import { PointList } from '../point-list'
import { TitledSection } from '../section'

const recordedKeys = ['booking', 'payer', 'photographs', 'words', 'phone', 'record', 'staff'] as const
const keptKeys = ['photographs', 'records', 'backups', 'links'] as const
const processorKeys = ['aws', 'paypal', 'claude', 'rekognition', 'email', 'texts', 'push'] as const
const erasureKeys = ['ask', 'owner', 'kept', 'payer', 'record'] as const

// The privacy notice (architecture.md section 15.2). The evidence periods come from the constants the evidence bucket's
// lifecycle rules are built from, so the page and the storage say the same thing.
export function PrivacyScreen() {
  const t = useTranslations('pages.privacy')
  const periods = { lockDays: EVIDENCE_LOCK_DAYS, keptDays: EVIDENCE_KEPT_DAYS, backupDays: BACKUP_KEPT_DAYS }

  return (
    <>
      <PageIntro title={t('title')} lead={t('lead')} action={{ href: routes.terms, label: t('action') }}>
        <p className="text-muted-foreground">{t('updated')}</p>
      </PageIntro>
      <TitledSection title={t('recorded.title')} lead={t('recorded.lead')}>
        <FeatureGrid items={recordedKeys.map((key) => ({ title: t(`recorded.items.${key}.title`), body: t(`recorded.items.${key}.body`) }))} />
      </TitledSection>
      <TitledSection title={t('kept.title')} lead={t('kept.lead')}>
        <FeatureGrid columns="four" items={keptKeys.map((key) => ({ title: t(`kept.items.${key}.title`), body: t(`kept.items.${key}.body`, periods) }))} />
      </TitledSection>
      <TitledSection title={t('processors.title')} lead={t('processors.lead')} tone="band">
        <FeatureGrid tone="band" items={processorKeys.map((key) => ({ title: t(`processors.items.${key}.title`), body: t(`processors.items.${key}.body`) }))} />
      </TitledSection>
      <TitledSection title={t('erasure.title')} lead={t('erasure.lead')}>
        <PointList points={erasureKeys.map((key) => t(`erasure.points.${key}`))} className="max-w-prose text-[1.0625rem]" />
      </TitledSection>
    </>
  )
}
