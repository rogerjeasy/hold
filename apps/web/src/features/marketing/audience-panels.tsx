import { cn } from 'cn'
import { useTranslations } from 'next-intl'
import motion from '@/features/site/motion.module.css'
import { routes } from '@/lib/routes'
import { AudiencePanel } from './audience-panel'
import { audienceImages, renterPointKeys, shopPointKeys } from './audience-points'

export function AudiencePanels() {
  const t = useTranslations('audiences')

  return (
    <div>
      <div className={cn('mx-auto grid max-w-page gap-5 px-4 py-16 md:grid-cols-2 md:px-8 md:py-22 lg:gap-6 lg:px-10 lg:py-28', motion.reveal)}>
        <AudiencePanel
          label={t('shops.label')}
          title={t('shops.title')}
          points={shopPointKeys.map((key) => t(`shops.points.${key}`))}
          action={{ href: routes.forShops, label: t('shops.action') }}
          image={{ src: audienceImages.shops, alt: t('shops.imageAlt') }}
          emphasis="primary"
        />
        <AudiencePanel
          label={t('renters.label')}
          title={t('renters.title')}
          points={renterPointKeys.map((key) => t(`renters.points.${key}`))}
          action={{ href: routes.forRenters, label: t('renters.action') }}
          image={{ src: audienceImages.renters, alt: t('renters.imageAlt') }}
          emphasis="contrast"
        />
      </div>
    </div>
  )
}
