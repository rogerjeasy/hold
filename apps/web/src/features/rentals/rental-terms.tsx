import type { RentalDetail } from '@hold/db'
import { money } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { Panel } from '@/components/ui/panel'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import { Link } from '@/i18n/navigation'
import { itemRoutes } from '@/lib/routes'
import { formatMoney } from '@/lib/money'

function Term({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.8125rem] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold wrap-long-words">{children}</dd>
    </div>
  )
}

// What the renter agreed to: when, which items, the fee, the hold and the version of the price list.
export function RentalTerms({ rental, clock }: { rental: RentalDetail; clock: ShopClock }) {
  const t = useTranslations('shop.rentals.detail')
  const format = useShopFormat(clock)
  const locale = useLocale()
  const amount = (cents: number) => formatMoney(money(cents, rental.currency), locale)
  return (
    <Panel title={t('terms')}>
      <dl className="grid gap-x-4 gap-y-4 px-4 py-4 sm:grid-cols-2 md:px-5">
        <Term label={t('when')}>
          {format.day(rental.startsAt)}, {format.time(rental.startsAt)} – {format.day(rental.endsAt)}, {format.time(rental.endsAt)}
        </Term>
        <Term label={t('items')}>
          <span className="flex flex-wrap gap-x-2">
            {rental.items.map((item) => (
              <Link key={item.id} href={itemRoutes.item(item.id)} className="inline-flex min-h-11 items-center underline underline-offset-4">
                {item.label}
              </Link>
            ))}
          </span>
        </Term>
        <Term label={t('fee')}>{amount(rental.feeCents)}</Term>
        <Term label={t('hold')}>{amount(rental.holdCents)}</Term>
        <Term label={t('prices')}>{t('pricesVersion', { version: rental.priceListVersion })}</Term>
        <Term label={t('bookedThrough')}>{rental.bookedThrough === 'staff' ? t('staff') : t('shopPage')}</Term>
        {rental.contactName === null && rental.contactEmail === null ? null : (
          <Term label={t('contact')}>{[rental.contactName, rental.contactEmail].filter((part) => part !== null && part !== '').join(' · ')}</Term>
        )}
        {rental.renterName === null ? null : <Term label={t('renter')}>{rental.renterName}</Term>}
      </dl>
    </Panel>
  )
}
