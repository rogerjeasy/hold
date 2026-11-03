import { Clock, Link2Off } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { RenterNote } from './renter-page'

// What a renter sees for a link that cannot be used. Changed, unknown, expired and revoked links look the same.
export function LinkRefused({ failure }: { failure: 'link_invalid' | 'scope' | 'rate_limited' }) {
  const t = useTranslations('renter')
  return <RenterNote quiet icon={failure === 'rate_limited' ? Clock : Link2Off} title={t('invalid.title')} body={failure === 'rate_limited' ? t('results.rate_limited') : t('invalid.body')} />
}
