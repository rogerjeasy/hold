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
    <div className="mx-auto grid w-full max-w-5xl content-start gap-8 px-4 pt-6 pb-16 md:px-8 md:pt-10">
      <header className="relative isolate grid animate-rise gap-3 py-2">
        <div aria-hidden="true" className="absolute -inset-x-4 -inset-y-6 -z-10 dot-grid mask-radial-[60%_80%] mask-radial-from-0% mask-radial-to-80% mask-radial-at-left opacity-60 md:-inset-x-8" />
        <p className="label inline-flex items-center gap-2 text-xs text-muted-foreground">
          <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
          {t('label')}
        </p>
        <h1 className="text-page-title text-balance wrap-long-words">{t('title', { shop: shop.name })}</h1>
        <p className="max-w-prose text-lead text-pretty text-muted-foreground">{t('lead')}</p>
      </header>
      {open ? (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="stagger grid min-w-0 gap-6">
            <PeriodForm from={period.from} to={period.to} invalid={period.invalid} />
            {period.period === undefined ? null : types.some((type) => type.available > 0) ? (
              <ShopBookingForm slug={shop.slug} types={types} currency={shop.currency} days={period.days} from={period.from} to={period.to} />
            ) : (
              <p className="surface p-4 text-muted-foreground md:p-5">{booking('nothingFree')}</p>
            )}
          </div>
          <div className="min-w-0 lg:sticky lg:top-20">
            <TermsView currency={shop.currency} prices={prices} wearPolicy={wearPolicy} />
          </div>
        </div>
      ) : (
        <div className="max-w-prose">
          <Notice title={t('closed.title')} body={t('closed.body')} />
        </div>
      )}
      <p className="border-t border-border/70 pt-4 text-sm text-muted-foreground">{t('poweredBy')}</p>
    </div>
  )
}
