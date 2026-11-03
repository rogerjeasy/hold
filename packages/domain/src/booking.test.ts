import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { blocksItem, BOOKING_LIMITS, bookingTerms, checkBooking, paymentDeadline, paymentLapsed, rentalDays } from './booking.ts'
import type { BookingLine } from './booking.ts'
import { money } from './money.ts'

const HOUR = 60 * 60 * 1000
const NOW = new Date('2026-10-15T09:00:00Z')
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR)
const eur = (cents: number) => money(cents, 'EUR')
const ebike: BookingLine = { itemTypeId: 'ebike', count: 2, dayRate: eur(40_00), hold: eur(300_00) }
const seat: BookingLine = { itemTypeId: 'seat', count: 1, dayRate: eur(8_00), hold: eur(50_00) }

describe('the days a rental is charged for', () => {
  it('counts each started 24 hours, and at least one', () => {
    expect(rentalDays(at(0), at(3))).toBe(1)
    expect(rentalDays(at(0), at(24))).toBe(1)
    expect(rentalDays(at(0), at(24.5))).toBe(2)
    expect(rentalDays(at(0), at(72))).toBe(3)
  })
})

describe('the terms of a booking', () => {
  it('prices each line at its day rate for every day, and holds each item’s hold', () => {
    const terms = bookingTerms([ebike, seat], 3, 'EUR')
    expect(terms.fee).toEqual(eur(2 * 3 * 40_00 + 3 * 8_00))
    expect(terms.hold).toEqual(eur(2 * 300_00 + 50_00))
    expect(terms.lines.map((line) => line.fee)).toEqual([eur(240_00), eur(24_00)])
  })

  it('matches Priya’s three days on an e-bike: 120 euros, with a 300 euro hold', () => {
    const terms = bookingTerms([{ ...ebike, count: 1 }], 3, 'EUR')
    expect([terms.fee, terms.hold]).toEqual([eur(120_00), eur(300_00)])
  })

  it('is always whole cents, the sum of its lines', () => {
    fc.assert(
      fc.property(fc.array(fc.record({ count: fc.integer({ min: 1, max: 10 }), rate: fc.integer({ min: 1, max: 100_000 }), hold: fc.integer({ min: 1, max: 500_000 }) }), { minLength: 1, maxLength: 10 }), fc.integer({ min: 1, max: 28 }), (rows, days) => {
        const lines = rows.map((row, index) => ({ itemTypeId: String(index), count: row.count, dayRate: eur(row.rate), hold: eur(row.hold) }))
        const terms = bookingTerms(lines, days, 'EUR')
        expect(Number.isInteger(terms.fee.cents)).toBe(true)
        expect(terms.fee.cents).toBe(terms.lines.reduce((sum, line) => sum + line.fee.cents, 0))
        expect(terms.hold.cents).toBe(rows.reduce((sum, row) => sum + row.hold * row.count, 0))
      }),
    )
  })
})

describe('a booking', () => {
  const valid = { startsAt: at(1), endsAt: at(73), now: NOW, currency: 'EUR', lines: [ebike] }

  it('is accepted with items and a period ahead', () => {
    expect(checkBooking(valid)).toEqual([])
  })

  it('may start a few minutes ago, for a renter at the counter', () => {
    expect(checkBooking({ ...valid, startsAt: at(-0.2) })).toEqual([])
    expect(checkBooking({ ...valid, startsAt: at(-1) })).toEqual([{ kind: 'starts_in_past' }])
  })

  it('names every problem with its period and its lines', () => {
    expect(checkBooking({ ...valid, endsAt: at(1), lines: [] })).toEqual([{ kind: 'period_reversed' }, { kind: 'no_items' }])
    expect(checkBooking({ ...valid, lines: [{ ...ebike, count: 0 }, { ...seat, dayRate: money(8_00, 'CHF') }] })).toEqual([
      { kind: 'count_invalid', line: 0 },
      { kind: 'wrong_currency', line: 1 },
    ])
  })

  it('lasts no longer than a hold can cover, and starts within the year', () => {
    expect(checkBooking({ ...valid, endsAt: at(1 + 24 * BOOKING_LIMITS.days + 1) })).toEqual([{ kind: 'too_long' }])
    expect(checkBooking({ ...valid, startsAt: at(24 * (BOOKING_LIMITS.aheadDays + 1)), endsAt: at(24 * (BOOKING_LIMITS.aheadDays + 2)) })).toEqual([{ kind: 'too_far_ahead' }])
  })
})

describe('whether a rental keeps an item from a period', () => {
  const period = { startsAt: at(24), endsAt: at(48) }
  const rental = { state: 'booked' as const, startsAt: at(30), endsAt: at(60), createdAt: at(-1) }

  it('does when their periods overlap and the rental still needs the item', () => {
    expect(blocksItem(rental, period, NOW)).toBe(true)
    expect(blocksItem({ ...rental, startsAt: at(48), endsAt: at(60) }, period, NOW)).toBe(false)
    expect(blocksItem({ ...rental, state: 'cancelled' }, period, NOW)).toBe(false)
  })

  it('counts an unpaid booking only until its payment lapses', () => {
    expect(blocksItem({ ...rental, state: 'pending_payment', createdAt: at(-0.1) }, period, NOW)).toBe(true)
    expect(blocksItem({ ...rental, state: 'pending_payment', createdAt: at(-1) }, period, NOW)).toBe(false)
  })

  it('counts an overdue rental for as long as the item is not back, whatever its period', () => {
    expect(blocksItem({ ...rental, state: 'overdue', startsAt: at(-72), endsAt: at(-24) }, period, NOW)).toBe(true)
  })

  it('counts an item the renter dropped off until now at least, since nobody has checked it yet', () => {
    expect(blocksItem({ ...rental, state: 'dropped_off', startsAt: at(-72), endsAt: at(-24) }, { startsAt: at(-1), endsAt: at(5) }, NOW)).toBe(true)
  })
})

describe('an unpaid booking', () => {
  it('lapses after the minutes it may keep its item', () => {
    expect(paymentLapsed(at(-0.2), NOW)).toBe(false)
    expect(paymentLapsed(at(-0.26), NOW)).toBe(true)
  })

  it('keeps its items until a deadline the renter can be shown, the moment after which it has lapsed', () => {
    const createdAt = at(-0.1)
    const deadline = paymentDeadline(createdAt)
    expect(deadline.getTime() - createdAt.getTime()).toBe(15 * 60_000)
    expect(paymentLapsed(createdAt, deadline)).toBe(false)
    expect(paymentLapsed(createdAt, new Date(deadline.getTime() + 1))).toBe(true)
  })
})
