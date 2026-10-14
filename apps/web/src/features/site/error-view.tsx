import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { StatusView } from './status-view'

export function ErrorView({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('errors.generic')

  return (
    <StatusView title={t('title')} body={t('body')}>
      <Button onClick={onRetry}>{t('retry')}</Button>
    </StatusView>
  )
}
