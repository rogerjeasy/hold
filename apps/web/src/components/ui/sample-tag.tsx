import { useTranslations } from 'next-intl'

// Beside every simulated row, so a sample is never read as a real rental or a real payment.
export function SampleTag() {
  const t = useTranslations('sample')
  return <span className="label shrink-0 border border-border-strong px-1.5 py-px text-[0.625rem] leading-normal text-muted-foreground">{t('label')}</span>
}
