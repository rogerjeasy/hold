import type { PassportRental } from '@hold/db'
import { money } from '@hold/domain'
import { History } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { SampleTag } from '@/components/ui/sample-tag'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import { formatMoney } from '@/lib/money'

// Every rental the item has been in, newest first.
export function PassportRentals({ rentals, clock }: { rentals: readonly PassportRental[]; clock: ShopClock }) {
  const t = useTranslations('shop.items.passport.rentals')
  const states = useTranslations('rentalStates')
  const format = useShopFormat(clock)
  const locale = useLocale()
  return (
    <Panel title={t('title')} icon={History} aside={rentals.length === 0 ? null : <span className="figures text-sm text-muted-foreground">{rentals.length}</span>}>
      {rentals.length === 0 ? (
        <p className="px-4 py-5 text-muted-foreground md:px-5">{t('empty')}</p>
      ) : (
        <ul className="stagger">
          {rentals.map((rental) => (
            <li key={rental.id} className="grid gap-1 border-b border-border/70 px-4 py-3.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-4 md:px-5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold wrap-long-words">
                  {rental.renterName ?? <span className="font-normal text-muted-foreground">{t('renterUnknown')}</span>}
                  {rental.simulated ? <SampleTag /> : null}
                </p>
                <p className="figures text-[0.8125rem] text-muted-foreground">{t('period', { start: format.day(rental.startsAt), end: format.day(rental.endsAt) })}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm sm:grid sm:justify-items-end sm:gap-1">
                <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-[0.8125rem] leading-none font-semibold">{states(rental.state)}</span>
                {rental.claim === undefined ? null : <span className="font-semibold tabular-nums">{t('claim', { amount: formatMoney(money(rental.claim.totalCents, rental.claim.currency), locale) })}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
