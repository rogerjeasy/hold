import { useTranslations } from 'next-intl'

// What a renter sees for a link that cannot be used. Changed, unknown, expired and revoked links look the same.
export function LinkRefused({ failure }: { failure: 'link_invalid' | 'scope' | 'rate_limited' }) {
  const t = useTranslations('renter')
  return (
    <div className="mx-auto grid w-full max-w-xl gap-4 px-4 py-12 md:px-8">
      <h1 className="text-page-title text-balance">{t('invalid.title')}</h1>
      <p className="text-lead text-muted-foreground">{failure === 'rate_limited' ? t('results.rate_limited') : t('invalid.body')}</p>
    </div>
  )
}
