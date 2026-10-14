import { useTranslations } from 'next-intl'

export function SkipLink() {
  const t = useTranslations('nav')

  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-lg focus:bg-contrast focus:px-4 focus:font-semibold focus:text-contrast-foreground"
    >
      {t('skip')}
    </a>
  )
}
