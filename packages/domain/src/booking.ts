import { add, money, zero } from './money.ts'
import type { Money } from './money.ts'
import { PENDING_PAYMENT_MINUTES } from './rental.ts'
import type { RentalState } from './rental.ts'

// What a booking costs and what it holds, and whether a rental keeps an item from another booking (architecture.md
// section 6.5). Amounts come from the item types' day rates and holds, never from the person booking.

const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE

// A rental lasts at most four weeks, so the hold placed at pickup outlives it, its return and a claim's reply.
export const BOOKING_LIMITS = { days: 28, aheadDays: 365, lines: 10, perLine: 10, pastMinutes: 15 } as const

export type BookingLine = { readonly itemTypeId: string; readonly count: number; readonly dayRate: Money; readonly hold: Money }

export type Period = { readonly startsAt: Date; readonly endsAt: Date }

// Each started 24 hours is a day, and a rental is at least one day.
export function rentalDays(startsAt: Date, endsAt: Date): number {
  return Math.max(1, Math.ceil((endsAt.getTime() - startsAt.getTime()) / DAY))
}

export type BookingTerms = {
  readonly days: number
  readonly fee: Money
  readonly hold: Money
  readonly lines: readonly (BookingLine & { readonly fee: Money })[]
}

export function bookingTerms(lines: readonly BookingLine[], days: number, currency: string): BookingTerms {
  const priced = lines.map((line) => ({ ...line, fee: money(line.dayRate.cents * line.count * days, currency) }))
  return {
    days,
    fee: priced.reduce((sum, line) => add(sum, line.fee), zero(currency)),
    hold: lines.reduce((sum, line) => add(sum, money(line.hold.cents * line.count, currency)), zero(currency)),
    lines: priced,
  }
}

export type BookingProblem =
  | { readonly kind: 'period_reversed' }
  | { readonly kind: 'starts_in_past' }
  | { readonly kind: 'too_long' }
  | { readonly kind: 'too_far_ahead' }
  | { readonly kind: 'no_items' }
  | { readonly kind: 'too_many_lines' }
  | { readonly kind: 'count_invalid'; readonly line: number }
  | { readonly kind: 'wrong_currency'; readonly line: number }

export type BookingDraft = Period & { readonly now: Date; readonly currency: string; readonly lines: readonly BookingLine[] }

export function checkBooking(draft: BookingDraft): readonly BookingProblem[] {
  const problems: BookingProblem[] = []
  const { startsAt, endsAt, now } = draft
  if (endsAt.getTime() <= startsAt.getTime()) problems.push({ kind: 'period_reversed' })
  else if (endsAt.getTime() - startsAt.getTime() > BOOKING_LIMITS.days * DAY) problems.push({ kind: 'too_long' })
  if (startsAt.getTime() < now.getTime() - BOOKING_LIMITS.pastMinutes * MINUTE) problems.push({ kind: 'starts_in_past' })
  if (startsAt.getTime() > now.getTime() + BOOKING_LIMITS.aheadDays * DAY) problems.push({ kind: 'too_far_ahead' })
  if (draft.lines.length === 0) problems.push({ kind: 'no_items' })
  if (draft.lines.length > BOOKING_LIMITS.lines) problems.push({ kind: 'too_many_lines' })
  draft.lines.forEach((line, index) => {
    if (!Number.isInteger(line.count) || line.count < 1 || line.count > BOOKING_LIMITS.perLine) problems.push({ kind: 'count_invalid', line: index })
    if (line.dayRate.currency !== draft.currency || line.hold.currency !== draft.currency) problems.push({ kind: 'wrong_currency', line: index })
  })
  return problems
}

// An unpaid booking keeps its items only this long.
export function paymentLapsed(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() > PENDING_PAYMENT_MINUTES * MINUTE
}

const RELEASED: ReadonlySet<RentalState> = new Set(['settling', 'closed', 'cancelled', 'abandoned'])

// Whether a rental keeps its item from a period. An item out, or back and being checked, is kept until now at least;
// an overdue one until it comes back, whenever that is.
export function blocksItem(rental: Period & { readonly state: RentalState; readonly createdAt: Date }, period: Period, now: Date): boolean {
  if (RELEASED.has(rental.state)) return false
  if (rental.state === 'pending_payment' && paymentLapsed(rental.createdAt, now)) return false
  const until = rental.state === 'overdue' ? Number.POSITIVE_INFINITY : Math.max(rental.endsAt.getTime(), ['out', 'returned', 'inspecting'].includes(rental.state) ? now.getTime() : 0)
  return rental.startsAt.getTime() < period.endsAt.getTime() && period.startsAt.getTime() < until
}
