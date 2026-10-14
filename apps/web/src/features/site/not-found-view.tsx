import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { routes } from '@/lib/routes'
import { StatusView } from './status-view'

export function NotFoundView() {
  const t = useTranslations('errors.notFound')

  return (
    <StatusView title={t('title')} body={t('body')}>
      <Button asChild>
        <Link href={routes.home}>
          {t('home')}
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </StatusView>
  )
}
