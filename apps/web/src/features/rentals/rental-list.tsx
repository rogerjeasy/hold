import type { RentalSummary } from '@hold/db'
import { money } from '@hold/domain'
import { Bot, Globe } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useId } from 'react'
import { SampleTag } from '@/components/ui/sample-tag'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import { Link } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import { formatMoney } from '@/lib/money'
import { RentalStateBadge } from './rental-state-badge'

// One grid for the column heads and the rows from lg, so they line up. Below lg each row stacks.
const columns = 'lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,1fr)_6rem_6rem_minmax(0,1fr)] lg:items-center lg:gap-x-4'

function RentalRow({ rental, clock }: { rental: RentalSummary; clock: ShopClock }) {
  const t = useTranslations('shop.rentals')
  const format = useShopFormat(clock)
  const locale = useLocale()
  const nameId = useId()
  const amount = (cents: number) => formatMoney(money(cents, rental.currency), locale)
  return (
    <li aria-labelledby={nameId} className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b px-4 py-3 last:border-b-0 md:px-5 ${columns}`}>
      <div className="min-w-0">
        <Link id={nameId} href={rentalRoutes.rental(rental.id)} className="inline-flex min-h-11 items-center font-semibold underline-offset-4 wrap-long-words hover:underline">
          {rental.who ?? t('notKnown')}
        </Link>
        <p className="flex flex-wrap items-center gap-1.5">
          {rental.simulated ? <SampleTag /> : null}
          {rental.bookedThrough === 'shop_page' ? (
            <span className="inline-flex items-center gap-1 text-[0.8125rem] text-muted-foreground">
              <Globe aria-hidden="true" className="size-3.5" />
              {t('fromShopPage')}
            </span>
          ) : rental.bookedThrough === 'assistant' ? (
            <span className="inline-flex items-center gap-1 text-[0.8125rem] text-muted-foreground">
              <Bot aria-hidden="true" className="size-3.5" />
              {t('fromAssistant')}
            </span>
          ) : null}
        </p>
      </div>
      <p className="col-start-1 min-w-0 text-sm text-muted-foreground wrap-long-words lg:col-start-auto lg:text-foreground">{rental.items.join(', ')}</p>
      <p className="col-start-1 text-sm text-muted-foreground lg:col-start-auto">{t('period', { start: format.day(rental.startsAt), end: format.day(rental.endsAt) })}</p>
      <p className="figures col-start-1 text-sm lg:col-start-auto">{amount(rental.feeCents)}</p>
      <p className="figures col-start-1 text-sm text-muted-foreground lg:col-start-auto lg:text-foreground">{amount(rental.holdCents)}</p>
      <div className="col-start-2 row-span-5 row-start-1 justify-self-end text-right lg:col-start-auto lg:row-span-1 lg:row-start-auto lg:justify-self-start lg:text-left">
        <RentalStateBadge state={rental.state} lapsed={rental.paymentLapsed} />
      </div>
    </li>
  )
}

export function RentalList({ rentals, clock }: { rentals: readonly RentalSummary[]; clock: ShopClock }) {
  const t = useTranslations('shop.rentals.columns')
  return (
    <div className="border bg-card text-card-foreground">
      <div aria-hidden="true" className={`label hidden border-b px-5 py-2.5 text-[0.6875rem] text-muted-foreground ${columns}`}>
        <span>{t('who')}</span>
        <span>{t('what')}</span>
        <span>{t('when')}</span>
        <span>{t('fee')}</span>
        <span>{t('hold')}</span>
        <span>{t('state')}</span>
      </div>
      <ul>
        {rentals.map((rental) => (
          <RentalRow key={rental.id} rental={rental} clock={clock} />
        ))}
      </ul>
    </div>
  )
}
