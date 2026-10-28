import type { RentalDetail, RentalHandover, RentalHold, RentalReturn } from '@hold/db'
import { ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SampleTag } from '@/components/ui/sample-tag'
import { ShopFrame } from '@/features/shop/shop-frame'
import type { ShopClock } from '@/hooks/use-shop-format'
import { Link } from '@/i18n/navigation'
import { rentalRoutes, shopRoutes } from '@/lib/routes'
import { HandoverPanel } from '@/features/handover/handover-panel'
import { ReturnPanel } from '@/features/returns/return-panel'
import { HoldPanel } from './hold-panel'
import { LetGo } from './let-go'
import { LinkPanel } from './link-panel'
import { RentalProgress } from './rental-progress'
import { RentalStateBadge } from './rental-state-badge'
import { RentalTerms } from './rental-terms'

type RentalScreenProps = { shopName: string; clock: ShopClock; rental: RentalDetail; hold: RentalHold | undefined; handovers: readonly RentalHandover[]; returns?: readonly RentalReturn[]; canAct: boolean }

// One rental: where it stands, what was agreed, the renter's link and the hold at pickup.
export function RentalScreen({ shopName, clock, rental, hold, handovers, returns = [], canAct }: RentalScreenProps) {
  const t = useTranslations('shop.rentals')
  const claim = useTranslations('claim')
  const records = useTranslations('records')
  const waiting = rental.state === 'pending_payment'
  const live = !['closed', 'cancelled', 'abandoned'].includes(rental.state) && !rental.simulated
  // Staff ask for the hold once the fee is paid. A placed hold is shown to everyone who can see the rental.
  const asking = canAct && live && (rental.state === 'booked' || rental.state === 'awaiting_hold')
  // Once the hold is placed, staff photograph each item; the panel stays to show what was sealed.
  const handingOver = canAct && live && (rental.state === 'ready' || rental.state === 'out')
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
        <Link href={rentalRoutes.record(rental.id)} className="inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4">{records('title')}</Link>
        {['returned', 'inspecting', 'settling', 'closed'].includes(rental.state) ? <Link href={rentalRoutes.claim(rental.id)} className="inline-flex min-h-12 items-center justify-self-start font-semibold underline underline-offset-4">{claim('title')}</Link> : null}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <RentalTerms rental={rental} clock={clock} />
          {/* At the counter on a phone, what staff act on comes before the terms. */}
          <div className="grid min-w-0 gap-6 max-lg:order-first">
            {live && ['out', 'overdue', 'returned', 'inspecting', 'settling'].includes(rental.state) ? <ReturnPanel rentalId={rental.id} returns={returns} canAct={canAct} /> : null}
            {/* A sample rental photographs nothing, but one that was compared leads to its comparison. */}
            {rental.simulated && returns.some((item) => item.comparisonId !== null) ? <ReturnPanel rentalId={rental.id} returns={returns} canAct={false} /> : null}
            {handingOver ? <HandoverPanel rentalId={rental.id} handovers={handovers} /> : null}
            {asking || hold?.state === 'placed' ? <HoldPanel rentalId={rental.id} state={rental.state} holdCents={rental.holdCents} hold={hold} clock={clock} /> : null}
            {canAct && live ? <LinkPanel rentalId={rental.id} contactEmail={rental.contactEmail} paid={!waiting} /> : null}
            {canAct && waiting ? <LetGo rentalId={rental.id} /> : null}
          </div>
        </div>
      </div>
    </ShopFrame>
  )
}
