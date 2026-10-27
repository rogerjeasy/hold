import { useTranslations } from 'next-intl'

// Beside every simulated row, so a sample is never read as a real rental or a real payment. Another simulated thing,
// such as the hosted assistant's scripted stand-in, may name itself its own way.
export function SampleTag({ label }: { label?: string }) {
  const t = useTranslations('sample')
  return <span className="label shrink-0 border border-border-strong px-1.5 py-px text-[0.625rem] leading-normal text-muted-foreground">{label ?? t('label')}</span>
}
