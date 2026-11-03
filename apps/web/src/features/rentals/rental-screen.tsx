import type { PayPalRecord, RentalDetail, RentalExtension, RentalHandover, RentalHold, RentalReturn, RentalText } from '@hold/db'
import { RENTAL_ENDED_STATES } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { BackLink } from '@/components/ui/back-link'
import { Notice } from '@/components/ui/notice'
import { ShopFrame } from '@/features/shop/shop-frame'
import type { ShopClock } from '@/hooks/use-shop-format'
import { shopRoutes } from '@/lib/routes'
import { TextsPanel } from '@/features/contact/texts-panel'
import { HandoverPanel } from '@/features/handover/handover-panel'
import { ReturnPanel } from '@/features/returns/return-panel'
import { StaffExtensions } from '@/features/extension/staff-extensions'
import { DropOffCard } from '@/features/self-return/drop-off-card'
import { EraseRenter } from '@/features/erasure/erase-renter'
import type { DropOffEntry } from '@/features/self-return/drop-off-card'
import { HoldPanel } from './hold-panel'
import { LetGo } from './let-go'
import { LinkPanel } from './link-panel'
import { PayPalRecordPanel } from './paypal-record-panel'
import { RentalOverview } from './rental-overview'
import { RentalTerms } from './rental-terms'

// dropOff: the item a renter left at the drop point, while nobody has checked it (architecture.md section 6.13).
// canErase: the owner, who alone may erase the renter's personal details once the rental has ended (section 15.2).
// paypal: every call Hold made to PayPal for the rental, shown to everyone who can see it (section 11.9).
type RentalScreenProps = { shopName: string; clock: ShopClock; rental: RentalDetail; hold: RentalHold | undefined; handovers: readonly RentalHandover[]; returns?: readonly RentalReturn[]; dropOff?: DropOffEntry | undefined; extensions?: readonly RentalExtension[]; texts?: readonly RentalText[]; paypal?: PayPalRecord | undefined; canAct: boolean; canErase?: boolean; linkHeld?: boolean }

const named = (name: string | null): name is string => name !== null && name.trim() !== ''

// The rental is named as the shop booked it; PayPal's name for who paid is a fact beside it, shown only when it differs
// (the audit found a page titled after the payer while its contact named the renter the shop booked).
function rentalTitle(rental: RentalDetail, unknown: string): { title: string; payer: string | null } {
  const title = named(rental.contactName) ? rental.contactName : (rental.who ?? unknown)
  return { title, payer: named(rental.renterName) && rental.renterName.trim() !== title.trim() ? rental.renterName : null }
}

// One rental: where it stands, what was agreed, the renter's link and the hold at pickup.
export function RentalScreen({ shopName, clock, rental, hold, handovers, returns = [], dropOff, extensions = [], texts = [], paypal, canAct, canErase = false, linkHeld = false }: RentalScreenProps) {
  const t = useTranslations('shop.rentals')
  const states = useTranslations('rentalStates')
  const waiting = rental.state === 'pending_payment'
  const live = !['closed', 'cancelled', 'abandoned'].includes(rental.state) && !rental.simulated
  // Staff ask for the hold once the fee is paid. A placed hold is shown to everyone who can see the rental.
  const asking = canAct && live && (rental.state === 'booked' || rental.state === 'awaiting_hold')
  // Once the hold is placed, staff photograph each item; the panel stays to show what was sealed.
  const handingOver = canAct && live && (rental.state === 'ready' || rental.state === 'out')
  const erased = rental.renterErasedAt !== null
  const { title, payer } = erased ? { title: t('detail.erasedRenter'), payer: null } : rentalTitle(rental, t('notKnown'))
  return (
    <ShopFrame shopName={shopName} title={title} actions={<BackLink href={shopRoutes.rentals}>{t('detail.back')}</BackLink>}>
      <div className="grid gap-6 md:gap-8">
        {rental.paymentLapsed ? <Notice tone="warning" title={states('lapsed')} body={t('detail.lapsedNote')} /> : null}
        {dropOff === undefined ? null : <DropOffCard entry={dropOff} clock={clock} canAct={canAct} />}
        <RentalOverview rental={rental} clock={clock} payer={payer} />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="stagger grid min-w-0 gap-6">
            <RentalTerms rental={rental} clock={clock} />
            <StaffExtensions extensions={extensions} clock={clock} />
            {paypal === undefined ? null : <PayPalRecordPanel record={paypal} clock={clock} />}
          </div>
          {/* At the counter on a phone, what staff act on comes before the terms. */}
          <div className="stagger grid min-w-0 gap-6 max-lg:order-first">
            {live && ['out', 'overdue', 'dropped_off', 'returned', 'inspecting', 'settling'].includes(rental.state) ? <ReturnPanel rentalId={rental.id} returns={returns} canAct={canAct} /> : null}
            {/* A sample rental photographs nothing, but one that was compared leads to its comparison. */}
            {rental.simulated && returns.some((item) => item.comparisonId !== null) ? <ReturnPanel rentalId={rental.id} returns={returns} canAct={false} /> : null}
            {handingOver ? <HandoverPanel rentalId={rental.id} handovers={handovers} /> : null}
            {asking || hold?.state === 'placed' ? <HoldPanel rentalId={rental.id} state={rental.state} holdCents={rental.holdCents} hold={hold} clock={clock} /> : null}
            {canAct && live ? <LinkPanel rentalId={rental.id} contact={rental.contactChannel === 'text' && rental.contactPhone !== null ? { channel: 'text', to: rental.contactPhone } : rental.contactEmail === null ? null : { channel: 'email', to: rental.contactEmail }} paid={!waiting} walkIn={waiting && hold?.strategy === 'combined'} held={linkHeld} /> : null}
            {canAct && waiting ? <LetGo rentalId={rental.id} /> : null}
            {texts.length > 0 ? <TextsPanel texts={texts} clock={clock} /> : null}
            {canErase && RENTAL_ENDED_STATES.includes(rental.state) ? <EraseRenter rentalId={rental.id} erasedAt={rental.renterErasedAt} clock={clock} /> : null}
          </div>
        </div>
      </div>
    </ShopFrame>
  )
}
