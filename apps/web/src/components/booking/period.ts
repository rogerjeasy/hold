import { atShopTime, BOOKING_LIMITS, rentalDays, shopTimeText } from '@hold/domain'
import type { Period } from '@hold/domain'

const HALF_HOUR = 30 * 60 * 1000
const DAY = 24 * 60 * 60 * 1000

export type ReadPeriod = { readonly from: string; readonly to: string; readonly period: Period | undefined; readonly days: number; readonly invalid: boolean }

// The dates in a booking page's address, on the shop's clock. Without them, from the next half hour for one day.
export function readPeriod(search: { readonly from?: string | string[]; readonly to?: string | string[] }, timeZone: string, now: Date): ReadPeriod {
  const given = typeof search.from === 'string' && typeof search.to === 'string'
  const start = new Date(Math.ceil((now.getTime() + 1) / HALF_HOUR) * HALF_HOUR)
  const from = typeof search.from === 'string' ? search.from : shopTimeText(timeZone, start)
  const to = typeof search.to === 'string' ? search.to : shopTimeText(timeZone, new Date(start.getTime() + DAY))
  const startsAt = atShopTime(timeZone, from)
  const endsAt = atShopTime(timeZone, to)
  const fits = startsAt !== undefined && endsAt !== undefined && endsAt > startsAt && endsAt.getTime() - startsAt.getTime() <= BOOKING_LIMITS.days * DAY
  if (!fits) return { from, to, period: undefined, days: 1, invalid: given }
  return { from, to, period: { startsAt, endsAt }, days: rentalDays(startsAt, endsAt), invalid: false }
}
