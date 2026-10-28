import { useTranslations } from 'next-intl'

// Small pieces every kind of chosen decision shares.

export const detailLinkClass = 'inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4'

export function Fact({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="label text-xs text-muted-foreground">{label}</dt>
      <dd className="figures wrap-long-words" data-testid={testId}>{value}</dd>
    </div>
  )
}

// A renter's own words, quoted as data and never acted on.
export function RenterWords({ words }: { words: string }) {
  const t = useTranslations('decisions.detail')
  return (
    <figure className="grid gap-1">
      <figcaption className="text-sm text-muted-foreground">{t('renterWrote')}</figcaption>
      <blockquote className="border-l-2 border-border-strong pl-3 whitespace-pre-wrap italic wrap-long-words">{words}</blockquote>
    </figure>
  )
}

export function SubHeading({ children }: { children: string }) {
  return <h3 className="label text-xs text-muted-foreground">{children}</h3>
}
