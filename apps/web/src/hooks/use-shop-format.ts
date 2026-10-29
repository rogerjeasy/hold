import { money } from '@hold/domain'
import { useFormatter, useLocale } from 'next-intl'
import { formatMoney } from '@/lib/money'

export type ShopClock = { readonly timeZone: string; readonly currency: string | null }

// Amounts in the shop's currency and times on the shop's clock, wherever the reader is. A shop with no currency yet
// has no amounts to show, so each reads as a dash.
export function useShopFormat({ timeZone, currency }: ShopClock) {
  const format = useFormatter()
  const locale = useLocale()
  return {
    money: (cents: number) => (currency === null ? '—' : formatMoney(money(cents, currency), locale)),
    time: (at: Date) => format.dateTime(at, { hour: '2-digit', minute: '2-digit', timeZone }),
    // A moment within the week, such as "Tue 18:00".
    when: (at: Date) => format.dateTime(at, { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone }),
    // A day of the year, such as "14 Oct".
    day: (at: Date) => format.dateTime(at, { day: 'numeric', month: 'short', timeZone }),
    date: (at: Date) => format.dateTime(at, { weekday: 'long', day: 'numeric', month: 'long', timeZone }),
    month: (at: Date) => format.dateTime(at, { month: 'long', timeZone }),
    // A date someone is held to, such as "Tue 3 Nov, 18:00".
    deadline: (at: Date) => format.dateTime(at, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone }),
    // How far off it is, such as "in 2 days".
    fromNow: (at: Date, now: Date) => format.relativeTime(at, now),
  }
}
