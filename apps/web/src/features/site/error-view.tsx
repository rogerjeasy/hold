import { RotateCcw, TriangleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { StatusView } from './status-view'

export function ErrorView({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('errors.generic')

  return (
    <StatusView icon={TriangleAlert} title={t('title')} body={t('body')}>
      <Button onClick={onRetry} className="min-h-12 px-5">
        <RotateCcw aria-hidden="true" />
        {t('retry')}
      </Button>
    </StatusView>
  )
}
