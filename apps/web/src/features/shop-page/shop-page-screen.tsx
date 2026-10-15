import type { BookableType } from '@hold/db'
import type { PriceCategory } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { PeriodForm } from '@/components/booking/period-form'
import type { ReadPeriod } from '@/components/booking/period'
import { TermsView } from '@/components/booking/terms-view'
import { Notice } from '@/components/ui/notice'
import { ShopBookingForm } from './shop-booking-form'

export type ShopPageScreenProps = {
  shop: { readonly slug: string; readonly name: string; readonly currency: string }
  // Whether the shop takes bookings online: it has a PayPal account, a price list and items.
  open: boolean
  period: ReadPeriod
  types: readonly BookableType[]
  prices: readonly { readonly description: string; readonly category: PriceCategory; readonly amountCents: number }[]
  wearPolicy: string
}

// A shop's own page, where a renter books with nobody signed in: dates, items, and the terms beside them.
export function ShopPageScreen({ shop, open, period, types, prices, wearPolicy }: ShopPageScreenProps) {
  const t = useTranslations('shopPage')
  const booking = useTranslations('booking')
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-8 md:px-8 md:py-12">
      <header className="grid gap-3">
        <p className="label text-xs text-muted-foreground">{t('label')}</p>
        <h1 className="text-page-title text-balance wrap-long-words">{t('title', { shop: shop.name })}</h1>
        <p className="max-w-prose text-lead text-muted-foreground">{t('lead')}</p>
      </header>
      {open ? (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="grid min-w-0 gap-6">
            <PeriodForm from={period.from} to={period.to} invalid={period.invalid} />
            {period.period === undefined ? null : types.some((type) => type.available > 0) ? (
              <ShopBookingForm slug={shop.slug} types={types} currency={shop.currency} days={period.days} from={period.from} to={period.to} />
            ) : (
              <p className="text-muted-foreground">{booking('nothingFree')}</p>
            )}
          </div>
          <TermsView currency={shop.currency} prices={prices} wearPolicy={wearPolicy} />
        </div>
      ) : (
        <div className="max-w-prose">
          <Notice title={t('closed.title')} body={t('closed.body')} />
        </div>
      )}
      <p className="text-sm text-muted-foreground">{t('poweredBy')}</p>
    </div>
  )
}
