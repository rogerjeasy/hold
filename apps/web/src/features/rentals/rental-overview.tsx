import type { RentalDetail } from '@hold/db'
import { ArrowRight, CalendarRange, FileText, Wallet } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { SampleTag } from '@/components/ui/sample-tag'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import { Link } from '@/i18n/navigation'
import { rentalRoutes } from '@/lib/routes'
import { RentalProgress } from './rental-progress'
import { RentalStateBadge } from './rental-state-badge'

// A returned rental waits on a person to settle it, so its claim is the page's main action; later it is for reading.
const SETTLE_NOW = ['returned', 'inspecting']
const SETTLED_OR_SETTLING = ['settling', 'closed']

// The head of a rental's page: where it stands, when it runs, who paid if PayPal names someone else, how far it has
// come, and where to go next.
export function RentalOverview({ rental, clock, payer }: { rental: RentalDetail; clock: ShopClock; payer: string | null }) {
  const t = useTranslations('shop.rentals.detail')
  const claim = useTranslations('claim')
  const records = useTranslations('records')
  const format = useShopFormat(clock)
  const claimShown = SETTLE_NOW.includes(rental.state) || SETTLED_OR_SETTLING.includes(rental.state)
  return (
    <div className="surface grid min-w-0 gap-6 p-4 md:p-6">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2.5">
        <RentalStateBadge state={rental.state} lapsed={rental.paymentLapsed} />
        {rental.simulated ? <SampleTag /> : null}
        <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarRange aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 wrap-long-words">{t('runs', { start: `${format.day(rental.startsAt)}, ${format.time(rental.startsAt)}`, end: `${format.day(rental.endsAt)}, ${format.time(rental.endsAt)}` })}</span>
        </span>
        {payer === null ? null : (
          <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            <Wallet aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0 wrap-long-words">{t('paidBy', { name: payer })}</span>
          </span>
        )}
      </div>
      <RentalProgress state={rental.state} />
      <div className="flex flex-wrap gap-2 border-t border-border/70 pt-5">
        {claimShown ? (
          <Button asChild variant={SETTLE_NOW.includes(rental.state) ? 'default' : 'outline'}>
            <Link href={rentalRoutes.claim(rental.id)}>
              {claim('title')}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
        <Button asChild variant="ghost">
          <Link href={rentalRoutes.record(rental.id)}>
            <FileText aria-hidden="true" />
            {records('title')}
          </Link>
        </Button>
      </div>
    </div>
  )
}
