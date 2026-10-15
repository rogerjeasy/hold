import type { PassportRental } from '@hold/db'
import { money } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { SampleTag } from '@/components/ui/sample-tag'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import { formatMoney } from '@/lib/money'

// Every rental the item has been in, newest first.
export function PassportRentals({ rentals, clock }: { rentals: readonly PassportRental[]; clock: ShopClock }) {
  const t = useTranslations('shop.items.passport.rentals')
  const format = useShopFormat(clock)
  const locale = useLocale()
  return (
    <Panel title={t('title')} aside={rentals.length === 0 ? null : <span className="figures text-sm text-muted-foreground">{rentals.length}</span>}>
      {rentals.length === 0 ? (
        <p className="px-4 py-5 text-muted-foreground md:px-5">{t('empty')}</p>
      ) : (
        <ul>
          {rentals.map((rental) => (
            <li key={rental.id} className="grid gap-1 border-b px-4 py-3.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-4 md:px-5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold wrap-long-words">
                  {rental.renterName ?? <span className="font-normal text-muted-foreground">{t('renterUnknown')}</span>}
                  {rental.simulated ? <SampleTag /> : null}
                </p>
                <p className="text-sm text-muted-foreground">{t('period', { start: format.day(rental.startsAt), end: format.day(rental.endsAt) })}</p>
              </div>
              <div className="text-sm sm:text-right">
                <p className="font-semibold">{t(`states.${rental.state}`)}</p>
                {rental.claim === undefined ? null : <p className="text-muted-foreground">{t('claim', { amount: formatMoney(money(rental.claim.totalCents, rental.claim.currency), locale) })}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
