import type { RentalDetail } from '@hold/db'
import { ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SampleTag } from '@/components/ui/sample-tag'
import { ShopFrame } from '@/features/shop/shop-frame'
import type { ShopClock } from '@/hooks/use-shop-format'
import { Link } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'
import { LetGo } from './let-go'
import { LinkPanel } from './link-panel'
import { RentalProgress } from './rental-progress'
import { RentalStateBadge } from './rental-state-badge'
import { RentalTerms } from './rental-terms'

type RentalScreenProps = { shopName: string; clock: ShopClock; rental: RentalDetail; canAct: boolean }

// One rental: where it stands, what was agreed, and the renter's link.
export function RentalScreen({ shopName, clock, rental, canAct }: RentalScreenProps) {
  const t = useTranslations('shop.rentals')
  const waiting = rental.state === 'pending_payment'
  const live = !['closed', 'cancelled', 'abandoned'].includes(rental.state) && !rental.simulated
  return (
    <ShopFrame shopName={shopName} title={rental.who ?? t('notKnown')}>
      <div className="grid gap-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href={shopRoutes.rentals} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft aria-hidden="true" className="size-4" />
            {t('detail.back')}
          </Link>
          <RentalStateBadge state={rental.state} lapsed={rental.paymentLapsed} />
          {rental.simulated ? <SampleTag /> : null}
        </div>
        {rental.paymentLapsed ? <p className="max-w-prose border-l-2 border-primary pl-3">{t('detail.lapsedNote')}</p> : null}
        <RentalProgress state={rental.state} />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <RentalTerms rental={rental} clock={clock} />
          <div className="grid min-w-0 gap-6">
            {canAct && live ? <LinkPanel rentalId={rental.id} contactEmail={rental.contactEmail} paid={!waiting} /> : null}
            {canAct && waiting ? <LetGo rentalId={rental.id} /> : null}
          </div>
        </div>
      </div>
    </ShopFrame>
  )
}
