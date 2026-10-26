import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { cleanRecord } from './clean-record.ts'
import { simulateLadder } from './ladder-simulation.ts'
import type { PastRental } from './ladder-simulation.ts'
import { money } from './money.ts'
import { rentalHoldFor } from './trust-ladder.ts'
import type { TrustLadder } from './trust-ladder.ts'

const DAY = 86_400_000
const START = new Date('2025-01-01T09:00:00Z')
const day = (index: number) => new Date(START.getTime() + index * DAY)
const chf = (cents: number) => money(cents, 'CHF')
const ebike = { hold: chf(300_00), value: chf(1800_00) }
const ladder: TrustLadder = {
  currency: 'CHF',
  history: 'own',
  windowMonths: 24,
  minimumFee: chf(0),
  minimumHours: 0,
  rungs: [
    { cleanReturns: 2, sharePercent: 50, largestValue: undefined, needsSavedMethod: false },
  ],
}
const rental = (renter: string, index: number, overrides: Partial<PastRental> = {}): PastRental => ({ renter, startsAt: day(index), closedAt: day(index + 1), outcome: 'clean', feeCaptured: true, fee: chf(40_00), hours: 24, items: [ebike], claimCents: 0, ...overrides })

describe('replaying a ladder over a shop’s past rentals', () => {
  it('lowers a hold only from returns closed before the rental began', () => {
    const past = [rental('priya', 0), rental('priya', 3), rental('priya', 6), rental('jonas', 7)]
    const simulation = simulateLadder(ladder, past)
    expect(simulation.rows.map((row) => row.amount.cents)).toEqual([300_00, 300_00, 150_00, 300_00])
    expect(simulation).toMatchObject({ rentals: 4, lowered: 1, loweredBy: chf(150_00), claimsAboveLoweredHold: 0, uncovered: chf(0) })
  })

  it('counts the past claims a lowered hold would not have covered, and by how much', () => {
    const past = [rental('priya', 0), rental('priya', 3), rental('priya', 6, { outcome: 'settled', claimCents: 200_00 }), rental('priya', 9, { claimCents: 100_00 })]
    expect(simulateLadder(ladder, past)).toMatchObject({ lowered: 2, loweredBy: chf(300_00), claimsAboveLoweredHold: 1, uncovered: chf(50_00) })
  })

  it('counts what a claim beyond even the ordinary hold left uncovered only up to the ordinary hold', () => {
    const past = [rental('priya', 0), rental('priya', 3), rental('priya', 6, { claimCents: 500_00 })]
    expect(simulateLadder(ladder, past)).toMatchObject({ claimsAboveLoweredHold: 1, uncovered: chf(150_00) })
  })

  it('applies the candidate ladder’s own minimum fee and length to the returns that count', () => {
    const past = [rental('priya', 0, { fee: chf(5_00) }), rental('priya', 3, { hours: 2 }), rental('priya', 6)]
    expect(simulateLadder({ ...ladder, minimumFee: chf(10_00), minimumHours: 4 }, past).lowered).toBe(0)
    expect(simulateLadder(ladder, past).lowered).toBe(1)
  })

  it('has totals equal to a direct recomputation, rental by rental', () => {
    const arbitraryRental = fc.record({
      renter: fc.constantFrom('a', 'b', 'c'),
      startsAt: fc.integer({ min: 0, max: 900 }).map(day),
      length: fc.integer({ min: 1, max: 10 }),
      outcome: fc.constantFrom('clean', 'settled', 'open'),
      feeCaptured: fc.boolean(),
      feeCents: fc.integer({ min: 0, max: 100_00 }),
      hours: fc.integer({ min: 1, max: 72 }),
      holds: fc.array(fc.integer({ min: 0, max: 1000_00 }), { minLength: 1, maxLength: 3 }),
      claimCents: fc.integer({ min: 0, max: 2000_00 }),
    })
    fc.assert(
      fc.property(fc.array(arbitraryRental, { maxLength: 30 }), fc.integer({ min: 1, max: 5 }), (drawn, needed) => {
        const past: PastRental[] = drawn.map((each) => ({
          renter: each.renter,
          startsAt: each.startsAt,
          closedAt: new Date(each.startsAt.getTime() + each.length * DAY),
          outcome: each.outcome,
          feeCaptured: each.feeCaptured,
          fee: chf(each.feeCents),
          hours: each.hours,
          items: each.holds.map((cents) => ({ hold: chf(cents), value: chf(1000_00) })),
          claimCents: each.claimCents,
        }))
        const candidate: TrustLadder = { ...ladder, minimumFee: chf(20_00), minimumHours: 3, rungs: [{ cleanReturns: needed, sharePercent: 40, largestValue: undefined, needsSavedMethod: false }] }
        const simulation = simulateLadder(candidate, past)
        let loweredBy = 0
        let lowered = 0
        let above = 0
        let uncovered = 0
        for (const each of past) {
          const earlier = past.filter((other) => other.renter === each.renter && other.closedAt.getTime() < each.startsAt.getTime())
          const counts = (other: PastRental) => other.feeCaptured && other.fee.cents >= 20_00 && other.hours >= 3
          const record = cleanRecord(earlier.map((other) => ({ outcome: other.outcome, closedAt: other.closedAt, counts: counts(other), unpaidAfter: null, shop: 'here' })), candidate.windowMonths, each.startsAt)
          const hold = rentalHoldFor(each.items, candidate, record)
          if (hold.amount.cents < hold.ordinary.cents) {
            lowered += 1
            loweredBy += hold.ordinary.cents - hold.amount.cents
            if (each.claimCents > hold.amount.cents) {
              above += 1
              uncovered += Math.min(each.claimCents, hold.ordinary.cents) - hold.amount.cents
            }
          }
        }
        expect(simulation).toMatchObject({ rentals: past.length, lowered, loweredBy: chf(loweredBy), claimsAboveLoweredHold: above, uncovered: chf(uncovered) })
      }),
    )
  })
})
