import type { BookableType } from '@hold/db'
import { useTranslations } from 'next-intl'
import { PeriodForm } from '@/components/booking/period-form'
import type { ReadPeriod } from '@/components/booking/period'
import { BackLink } from '@/components/ui/back-link'
import { Notice } from '@/components/ui/notice'
import { ShopFrame } from '@/features/shop/shop-frame'
import { buttonVariants } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'
import { BookingForm } from './booking-form'

export type NewRentalScreenProps = {
  shopName: string
  currency: string
  period: ReadPeriod
  types: readonly BookableType[]
  // What the shop still needs before it can book: PayPal, where the fee is paid, and items to book.
  ready: 'ready' | 'needs_paypal' | 'needs_items'
  // The rental starts on the shop's own today, so staff may let a walk-in approve the fee and the hold at once.
  startsToday?: boolean
}

function SetUpFirst({ need }: { need: 'needs_paypal' | 'needs_items' }) {
  const t = useTranslations(`shop.rentals.${need === 'needs_paypal' ? 'needsPayPal' : 'needsItems'}`)
  return (
    <div className="grid max-w-prose gap-4">
      <Notice title={t('title')} body={t('body')} />
      <Link href={need === 'needs_paypal' ? shopRoutes.paypal : shopRoutes.items} className={buttonVariants({ className: 'justify-self-start' })}>
        {t('action')}
      </Link>
    </div>
  )
}

// Booking at the counter or on the phone: when, then what is free then, then for whom.
export function NewRentalScreen({ shopName, currency, period, types, ready, startsToday = false }: NewRentalScreenProps) {
  const t = useTranslations('shop.rentals')
  const booking = useTranslations('booking')
  return (
    <ShopFrame shopName={shopName} title={t('form.title')} actions={<BackLink href={shopRoutes.rentals}>{t('form.back')}</BackLink>}>
      <div className="grid max-w-4xl gap-8">
        {ready === 'ready' ? (
          <>
            <PeriodForm from={period.from} to={period.to} invalid={period.invalid} />
            {period.period === undefined ? null : types.some((type) => type.available > 0) ? (
              <BookingForm types={types} currency={currency} days={period.days} from={period.from} to={period.to} startsToday={startsToday} />
            ) : (
              <p className="surface px-5 py-6 text-center text-muted-foreground">{booking('nothingFree')}</p>
            )}
          </>
        ) : (
          <SetUpFirst need={ready} />
        )}
      </div>
    </ShopFrame>
  )
}
