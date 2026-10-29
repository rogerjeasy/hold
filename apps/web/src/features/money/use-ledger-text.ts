import type { LineFlow, MoneyCheck } from '@hold/domain'
import { useFormatter, useTranslations } from 'next-intl'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import type { LedgerRentalRow, LedgerRow } from './ledger-rows'

// How the money ledger reads, in the viewer's language and on the shop's clock. The grid, the opened line, the cards
// on a phone and the spreadsheet all word lines and rentals through this, so they always say the same thing.
export function useLedgerText(clock: ShopClock) {
  const t = useTranslations('money')
  const format = useFormatter()
  const shop = useShopFormat(clock)
  const moment = (at: Date) => `${shop.day(at)}, ${shop.time(at)}`

  // What a line did, in words: a release says whether it was money back or made way for a new hold.
  const what = (row: Pick<LedgerRow, 'kind' | 'flow'>) => (row.kind === 'hold_released' && row.flow === 'replaced' ? t('kinds.replaced') : t(`kinds.${row.kind}`))
  const renter = (rental: Pick<LedgerRentalRow, 'renterName'>) => rental.renterName ?? t('renter')
  const period = (rental: Pick<LedgerRentalRow, 'startsAt' | 'endsAt'>) => t('period', { from: shop.day(rental.startsAt), to: shop.day(rental.endsAt) })
  // "2026-10" read as "October 2026", on the shop's clock: the middle of the month never crosses a time zone's edge.
  const month = (key: string) => format.dateTime(new Date(`${key}-15T12:00:00Z`), { month: 'long', year: 'numeric', timeZone: clock.timeZone })
  const checks = (found: readonly MoneyCheck[]) => (found.length === 0 ? t('checks.agrees') : found.map((check) => t(`checks.${check}`)).join(' '))

  return {
    money: shop.money,
    moment,
    what,
    renter,
    period,
    month,
    checks,
    // Names an opened line and its button: what it did and how much.
    lineName: (row: LedgerRow) => t('lineName', { what: what(row), amount: shop.money(row.amountCents) }),
    flow: (flow: LineFlow) => t(`flows.${flow}`),
  }
}

export type LedgerText = ReturnType<typeof useLedgerText>
