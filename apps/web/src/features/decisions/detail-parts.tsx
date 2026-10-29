import { useTranslations } from 'next-intl'

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
