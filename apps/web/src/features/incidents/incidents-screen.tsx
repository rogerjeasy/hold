import type { ShopIncident } from '@hold/db'
import { Inbox } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { EmptyState } from '@/components/ui/empty-state'
import { SEGMENTED_TRACK, segmentClass } from '@/components/ui/segmented'
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
    <ShopFrame shopName={shopName} title={t('title')} description={t('lead')}>
      <div className="grid min-w-0 gap-6">
        {/* Links, not buttons: each view is its own address. */}
        <nav aria-label={t('filter')} className="max-w-full min-w-0 overflow-x-auto">
          <div className={SEGMENTED_TRACK}>
            <Link href={shopRoutes.incidents} aria-current={waitingOnly ? 'page' : undefined} className={segmentClass(waitingOnly)}>{t('waiting')}</Link>
            <Link href={`${shopRoutes.incidents}?show=all`} aria-current={waitingOnly ? undefined : 'page'} className={segmentClass(!waitingOnly)}>{t('all')}</Link>
          </div>
        </nav>
        {incidents.length === 0 ? (
          <div className="surface max-w-2xl">
            <EmptyState icon={Inbox} title={waitingOnly ? t('noneWaiting') : t('none')} body={t('emptyBody')} />
          </div>
        ) : (
          <div className="stagger grid min-w-0 items-start gap-5 lg:grid-cols-2">
            {incidents.map((incident) => <IncidentCard key={incident.id} incident={incident} clock={clock} canAct={canAct} />)}
          </div>
        )}
      </div>
    </ShopFrame>
  )
}
