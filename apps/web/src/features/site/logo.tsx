import { cn } from 'cn'
import { useTranslations } from 'next-intl'

// `className` sets the size where the word is shown larger, such as across the foot of the site. The mark itself
// never changes.
export function Logo({ className }: { className?: string }) {
  const t = useTranslations('meta')
  const name = t('siteName')
  const [beforeO, afterO] = name.toLowerCase().split('o')

  return (
    <span role="img" aria-label={name} className={cn('wordmark text-2xl', className)}>
      {beforeO}
      <span className="held-o">
        <span>o</span>
      </span>
      {afterO}
    </span>
  )
}
