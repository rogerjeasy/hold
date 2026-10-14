import { useTranslations } from 'next-intl'

export function Logo() {
  const t = useTranslations('meta')
  const name = t('siteName')
  const [beforeO, afterO] = name.toLowerCase().split('o')

  return (
    <span role="img" aria-label={name} className="wordmark text-2xl">
      {beforeO}
      <span className="held-o">
        <span>o</span>
      </span>
      {afterO}
    </span>
  )
}
