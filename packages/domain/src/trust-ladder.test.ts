import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { CleanRecord } from './clean-record.ts'
import { money } from './money.ts'
import { checkLadder, holdFor, LADDER_LIMITS, rentalHoldFor } from './trust-ladder.ts'
import type { TrustLadder, TrustRung } from './trust-ladder.ts'

const chf = (cents: number) => money(cents, 'CHF')
const rung = (cleanReturns: number, sharePercent: number, largestValue?: number, needsSavedMethod = false): TrustRung => ({
  cleanReturns,
  sharePercent,
  largestValue: largestValue === undefined ? undefined : chf(largestValue),
  needsSavedMethod,
})

// The example ladder in extensions.md section 7.5.
const ladder: TrustLadder = {
  currency: 'CHF',
  history: 'network',
  windowMonths: 24,
  minimumFee: chf(0),
  minimumHours: 0,
  rungs: [rung(3, 75, 2000_00), rung(5, 50, 2000_00), rung(10, 0, 1000_00, true)],
}
const record = (clean: number, unpaid = 0): CleanRecord => ({ clean, settled: 0, unpaid, open: 0, shops: 1, windowMonths: 24 })
const ebike = { hold: chf(300_00), value: chf(1800_00) }

describe('the hold a ladder gives', () => {
  it('is the ordinary hold for fewer clean returns than the first rung needs', () => {
    expect(holdFor(ebike, ladder, record(2))).toEqual({ amount: chf(300_00), ordinary: chf(300_00), rung: 0 })
  })

  it('is the share of the highest rung reached', () => {
    expect(holdFor(ebike, ladder, record(3))).toEqual({ amount: chf(225_00), ordinary: chf(300_00), rung: 1 })
    expect(holdFor(ebike, ladder, record(5))).toEqual({ amount: chf(150_00), ordinary: chf(300_00), rung: 2 })
  })

  it('never reaches a rung that needs a saved PayPal method, which Hold does not keep yet', () => {
    expect(holdFor({ hold: chf(300_00), value: chf(500_00) }, ladder, record(40))).toMatchObject({ amount: chf(150_00), rung: 2 })
  })

  it('does not lower the hold of an item worth more than a rung covers', () => {
    expect(holdFor({ hold: chf(800_00), value: chf(4000_00) }, ladder, record(8))).toMatchObject({ amount: chf(800_00), rung: 0 })
  })

  it('falls back to a lower rung whose cover the item fits', () => {
    const covers: TrustLadder = { ...ladder, rungs: [rung(3, 75), rung(5, 50, 1000_00)] }
    expect(holdFor({ hold: chf(300_00), value: chf(1500_00) }, covers, record(5))).toMatchObject({ amount: chf(225_00), rung: 1 })
  })

  it('gives no reduction while a decided claim is unpaid', () => {
    expect(holdFor(ebike, ladder, record(9, 1))).toMatchObject({ amount: chf(300_00), rung: 0 })
  })

  it('rounds a share up to the cent, so the hold is never below its share', () => {
    expect(holdFor({ hold: chf(333_33), value: chf(1000_00) }, ladder, record(3)).amount).toEqual(chf(250_00))
  })

  const arbitraryRung = fc.record({
    cleanReturns: fc.integer({ min: 0, max: 30 }),
    sharePercent: fc.integer({ min: 0, max: 100 }),
    largestValue: fc.option(fc.integer({ min: 0, max: 500_000 }).map(chf), { nil: undefined }),
    needsSavedMethod: fc.boolean(),
  })
  const arbitraryLadder = fc.array(arbitraryRung, { maxLength: 6 }).map((rungs): TrustLadder => ({ ...ladder, rungs }))
  const arbitraryItem = fc.record({ hold: fc.integer({ min: 0, max: 10_000_000 }).map(chf), value: fc.integer({ min: 0, max: 1_000_000 }).map(chf) })

  it('is never above the ordinary hold and never below zero, for any ladder and record', () => {
    fc.assert(
      fc.property(arbitraryItem, arbitraryLadder, fc.nat(50), fc.nat(2), (item, anyLadder, clean, unpaid) => {
        const { amount } = holdFor(item, anyLadder, record(clean, unpaid))
        expect(amount.cents).toBeGreaterThanOrEqual(0)
        expect(amount.cents).toBeLessThanOrEqual(item.hold.cents)
        expect(Number.isSafeInteger(amount.cents)).toBe(true)
      }),
    )
  })

  it('never rises as clean returns rise, for any ladder', () => {
    fc.assert(
      fc.property(arbitraryItem, arbitraryLadder, fc.nat(50), fc.nat(20), (item, anyLadder, clean, more) => {
        expect(holdFor(item, anyLadder, record(clean + more)).amount.cents).toBeLessThanOrEqual(holdFor(item, anyLadder, record(clean)).amount.cents)
      }),
    )
  })

  it('is the ordinary hold with no history, however generous the ladder', () => {
    fc.assert(
      fc.property(arbitraryItem, arbitraryLadder, (item, anyLadder) => {
        const nothing = holdFor(item, { ...anyLadder, rungs: anyLadder.rungs.filter((each) => each.cleanReturns > 0) }, record(0))
        expect(nothing.amount).toEqual(item.hold)
      }),
    )
  })
})

describe('the hold for a whole rental', () => {
  it('adds each item’s hold, names the highest rung applied, and says why', () => {
    const helmet = { hold: chf(20_00), value: chf(80_00) }
    const expensive = { hold: chf(900_00), value: chf(5000_00) }
    expect(rentalHoldFor([ebike, helmet, expensive], ladder, record(5))).toEqual({
      amount: chf(150_00 + 10_00 + 900_00),
      ordinary: chf(300_00 + 20_00 + 900_00),
      rung: 2,
      cleanReturns: 5,
      windowMonths: 24,
    })
  })

  it('is the ordinary hold, at rung zero, with no ladder at all', () => {
    expect(rentalHoldFor([ebike], undefined, record(12))).toEqual({ amount: chf(300_00), ordinary: chf(300_00), rung: 0, cleanReturns: 12, windowMonths: 24 })
  })
})

describe('a ladder a shop publishes', () => {
  it('is accepted when each rung needs more returns and keeps less of the hold', () => {
    expect(checkLadder(ladder)).toEqual([])
  })

  it('may have no rungs, which keeps every hold ordinary', () => {
    expect(checkLadder({ ...ladder, rungs: [] })).toEqual([])
  })

  it('names every problem, by rung', () => {
    expect(
      checkLadder({
        ...ladder,
        windowMonths: 0,
        minimumHours: -1,
        minimumFee: money(5_00, 'EUR'),
        rungs: [rung(0, 75), rung(4, 80), rung(4, 0), rung(6, 101, 0)],
      }),
    ).toEqual([
      { kind: 'window_invalid' },
      { kind: 'minimum_hours_invalid' },
      { kind: 'minimum_fee_wrong_currency' },
      { kind: 'clean_returns_invalid', rung: 1 },
      { kind: 'share_not_falling', rung: 2 },
      { kind: 'clean_returns_not_rising', rung: 3 },
      { kind: 'share_zero_needs_saved_method', rung: 3 },
      { kind: 'share_invalid', rung: 4 },
      { kind: 'cover_invalid', rung: 4 },
    ])
  })

  it('has at most five rungs', () => {
    expect(LADDER_LIMITS.rungs).toBe(5)
    const many = Array.from({ length: 6 }, (_, index) => rung(index + 1, 90 - index * 10))
    expect(checkLadder({ ...ladder, rungs: many })).toEqual([{ kind: 'too_many_rungs' }])
  })

  it('refuses a cover in another currency', () => {
    expect(checkLadder({ ...ladder, rungs: [{ ...rung(3, 75), largestValue: money(1000_00, 'EUR') }] })).toEqual([{ kind: 'cover_invalid', rung: 1 }])
  })
})
