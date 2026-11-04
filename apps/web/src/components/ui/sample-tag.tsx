import { useTranslations } from 'next-intl'

// Beside every simulated row, so a sample is never read as a real rental or a real payment. Another simulated thing,
// such as the hosted assistant's scripted stand-in, may name itself its own way.
export function SampleTag({ label }: { label?: string }) {
  const t = useTranslations('sample')
  return (
    // It keeps its size beside other words, and a long label wraps inside it rather than push a phone's page sideways.
    <span className="label inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full border border-border-strong/70 bg-muted px-2 py-0.5 text-xs leading-normal text-foreground/80">
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-warning" />
      <span className="min-w-0 wrap-long-words">{label ?? t('label')}</span>
    </span>
  )
}
