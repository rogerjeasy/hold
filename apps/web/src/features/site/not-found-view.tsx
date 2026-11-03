import { ArrowRight, MapPinOff } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { routes } from '@/lib/routes'
import { StatusView } from './status-view'

export function NotFoundView() {
  const t = useTranslations('errors.notFound')

  return (
    <StatusView icon={MapPinOff} title={t('title')} body={t('body')}>
      <Button asChild className="group min-h-12 px-5">
        <Link href={routes.home}>
          {t('home')}
          <ArrowRight aria-hidden="true" className="transition-transform duration-300 ease-spring group-hover:translate-x-0.5" />
        </Link>
      </Button>
    </StatusView>
  )
}
