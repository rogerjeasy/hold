import type { ShopIncident } from '@hold/db'
import { useTranslations } from 'next-intl'
import type { ShopClock } from '@/hooks/use-shop-format'
import { Link } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'
import { ShopFrame } from '@/features/shop/shop-frame'
import { IncidentCard } from './incident-card'

// What renters reported during their rentals (extensions.md section 10). Waiting: what a person must act on, by
// confirming a price or deciding. The list is complete whether or not the model answered.
export function IncidentsScreen({ shopName, clock, incidents, waitingOnly, canAct }: { shopName: string; clock: ShopClock; incidents: readonly ShopIncident[]; waitingOnly: boolean; canAct: boolean }) {
  const t = useTranslations('shop.incidents')
  return (
    <ShopFrame shopName={shopName} title={t('title')}>
      <div className="grid gap-6">
        <p className="max-w-prose text-muted-foreground">{t('lead')}</p>
        <nav aria-label={t('filter')} className="flex flex-wrap gap-4">
          <Link href={shopRoutes.incidents} aria-current={waitingOnly ? 'page' : undefined} className="inline-flex min-h-11 items-center font-semibold underline-offset-4 aria-[current=page]:underline">{t('waiting')}</Link>
          <Link href={`${shopRoutes.incidents}?show=all`} aria-current={waitingOnly ? undefined : 'page'} className="inline-flex min-h-11 items-center font-semibold underline-offset-4 aria-[current=page]:underline">{t('all')}</Link>
        </nav>
        {incidents.length === 0 ? <p>{waitingOnly ? t('noneWaiting') : t('none')}</p> : (
          <div className="grid gap-4 lg:grid-cols-2">
            {incidents.map((incident) => <IncidentCard key={incident.id} incident={incident} clock={clock} canAct={canAct} />)}
          </div>
        )}
      </div>
    </ShopFrame>
  )
}
