import type { RentalSummary } from '@hold/db'
import { money } from '@hold/domain'
import { Bot, ChevronRight, Globe } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useId } from 'react'
import { SampleTag } from '@/components/ui/sample-tag'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import { Link } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import { formatMoney } from '@/lib/money'
import { RentalStateBadge } from './rental-state-badge'

// One grid for the column heads and the rows from xl, so they line up. Below xl each row is a small card: the mark
// beside the name, then the state, the items and the figures under the name.
const columns = 'xl:grid-cols-[2.5rem_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_5.5rem_5.5rem_minmax(9rem,1fr)_1rem] xl:items-center xl:gap-x-5'

// Up to two initials, from the name the rental goes by, for the round mark beside it.
function initials(name: string | null): string {
  if (name === null) return '·'
  const parts = name.trim().split(/\s+/).filter((part) => part !== '')
  const first = parts[0] ?? ''
  const last = parts.length > 1 ? (parts.at(-1) ?? '') : ''
  return (last === '' ? first.slice(0, 2) : `${first.slice(0, 1)}${last.slice(0, 1)}`).toUpperCase() || '·'
}

function Channel({ rental }: { rental: RentalSummary }) {
  const t = useTranslations('shop.rentals')
  if (rental.bookedThrough === 'staff') return null
  const Icon = rental.bookedThrough === 'shop_page' ? Globe : Bot
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-[0.8125rem] text-muted-foreground">
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0 wrap-long-words">{rental.bookedThrough === 'shop_page' ? t('fromShopPage') : t('fromAssistant')}</span>
    </span>
  )
}

function RentalRow({ rental, clock }: { rental: RentalSummary; clock: ShopClock }) {
  const t = useTranslations('shop.rentals')
  const columnNames = useTranslations('shop.rentals.columns')
  const format = useShopFormat(clock)
  const locale = useLocale()
  const nameId = useId()
  const amount = (cents: number) => formatMoney(money(cents, rental.currency), locale)
  const ended = rental.paymentLapsed || ['closed', 'cancelled', 'abandoned'].includes(rental.state)
  return (
    <li aria-labelledby={nameId} className={`group relative grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1.5 px-4 py-4 transition-colors duration-200 ease-swift hover:bg-foreground/[0.03] md:px-5 xl:py-3.5 ${columns}`}>
      <span aria-hidden="true" className={`grid size-10 place-items-center rounded-full text-[0.8125rem] font-bold tracking-tight ${ended ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
        {initials(rental.who)}
      </span>
      <div className="grid min-w-0 gap-0.5 self-center">
        {/* The whole row answers the pointer; the name is its one link, so the row reads once to a screen reader. */}
        <Link id={nameId} href={rentalRoutes.rental(rental.id)} className="min-w-0 font-semibold wrap-long-words after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring">
          {rental.who ?? t('notKnown')}
        </Link>
        {rental.simulated || rental.bookedThrough !== 'staff' ? (
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {/* Below xl the sample mark sits beside the state instead, to keep the card short. */}
            {rental.simulated ? <span className="max-xl:hidden"><SampleTag /></span> : null}
            <Channel rental={rental} />
          </span>
        ) : null}
      </div>
      <p className="col-start-2 min-w-0 text-[0.9375rem] wrap-long-words xl:col-start-auto">{rental.items.join(', ')}</p>
      {/* Below xl the three figures share a line, each named; from xl they are columns under their heads. */}
      <div className="col-start-2 flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-sm xl:contents">
        <p className="text-muted-foreground">{t('period', { start: format.day(rental.startsAt), end: format.day(rental.endsAt) })}</p>
        <p><span className="text-muted-foreground xl:sr-only">{columnNames('fee')} </span><span className="figures">{amount(rental.feeCents)}</span></p>
        <p><span className="text-muted-foreground xl:sr-only">{columnNames('hold')} </span><span className="figures xl:text-muted-foreground">{amount(rental.holdCents)}</span></p>
      </div>
      {/* Below xl the state sits right under the name, the first thing read after who it is. */}
      <div className="col-start-2 row-start-2 flex min-w-0 flex-wrap items-center gap-2 xl:col-start-auto xl:row-start-auto">
        <RentalStateBadge state={rental.state} lapsed={rental.paymentLapsed} />
        {rental.simulated ? <span className="xl:hidden"><SampleTag /></span> : null}
      </div>
      <ChevronRight aria-hidden="true" className="hidden size-4 text-muted-foreground transition-transform duration-200 ease-swift group-hover:translate-x-0.5 xl:block" />
    </li>
  )
}

export function RentalList({ rentals, clock }: { rentals: readonly RentalSummary[]; clock: ShopClock }) {
  const t = useTranslations('shop.rentals.columns')
  return (
    <div className="surface overflow-clip">
      <div aria-hidden="true" className={`label hidden border-b border-border/70 bg-muted/50 px-5 py-3 text-[0.6875rem] text-muted-foreground xl:grid ${columns}`}>
        <span />
        <span>{t('who')}</span>
        <span>{t('what')}</span>
        <span>{t('when')}</span>
        <span>{t('fee')}</span>
        <span>{t('hold')}</span>
        <span>{t('state')}</span>
        <span />
      </div>
      <ul className="stagger divide-y divide-border/70">
        {rentals.map((rental) => (
          <RentalRow key={rental.id} rental={rental} clock={clock} />
        ))}
      </ul>
    </div>
  )
}
