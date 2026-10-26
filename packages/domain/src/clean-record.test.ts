import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { cleanRecord, countsTowardRecord, closedOutcome, INVOICE_DUE_DAYS, outcomeNow, windowStart } from './clean-record.ts'
import type { OutcomeRow } from './clean-record.ts'
import { money } from './money.ts'

const NOW = new Date('2026-10-26T09:00:00Z')
const DAY = 86_400_000
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY)
const row = (overrides: Partial<OutcomeRow> = {}): OutcomeRow => ({ outcome: 'clean', closedAt: daysAgo(10), counts: true, unpaidAfter: null, shop: 'a', ...overrides })
const chf = (cents: number) => money(cents, 'CHF')

describe('the outcome a closed rental writes', () => {
  it('is clean when nothing was taken in the end', () => {
    expect(closedOutcome({ takenCents: 0 })).toBe('clean')
  })

  it('is settled when a claim was paid, from the hold or an invoice', () => {
    expect(closedOutcome({ takenCents: 45_00 })).toBe('settled')
  })
})

describe('what counts toward a record', () => {
  const minimums = { fee: chf(20_00), hours: 4 }
  const rental = { feeCaptured: true, fee: chf(40_00), hours: 24, simulated: false }

  it('counts a rental whose fee PayPal captured and which met the shop’s minimum fee and length', () => {
    expect(countsTowardRecord(rental, minimums)).toBe(true)
  })

  it.each([
    ['a fee PayPal never captured', { feeCaptured: false }],
    ['a fee below the shop’s minimum', { fee: chf(19_99) }],
    ['a rental shorter than the shop’s minimum', { hours: 3 }],
    ['a simulated sample rental', { simulated: true }],
  ])('does not count %s', (_, change) => {
    expect(countsTowardRecord({ ...rental, ...change }, minimums)).toBe(false)
  })

  it('needs only a captured fee when the shop has set no minimums', () => {
    expect(countsTowardRecord({ ...rental, fee: chf(1) , hours: 1 }, undefined)).toBe(true)
  })
})

describe('an outcome as it stands now', () => {
  it('is open while an invoice for a decided claim is not yet due', () => {
    expect(outcomeNow(row({ outcome: 'open', unpaidAfter: new Date(NOW.getTime() + DAY) }), NOW)).toBe('open')
  })

  it('becomes unpaid once the invoice is past due', () => {
    expect(outcomeNow(row({ outcome: 'open', unpaidAfter: NOW }), NOW)).toBe('unpaid')
  })

  it('keeps a clean or settled outcome as it was written', () => {
    expect(outcomeNow(row(), NOW)).toBe('clean')
    expect(outcomeNow(row({ outcome: 'settled' }), NOW)).toBe('settled')
  })

  it('gives an invoice a month to be paid', () => {
    expect(INVOICE_DUE_DAYS).toBe(30)
  })
})

describe('a renter’s clean record', () => {
  it('counts each outcome, and the different shops behind the returns', () => {
    const rows = [row(), row({ shop: 'b' }), row({ outcome: 'settled' }), row({ outcome: 'open', unpaidAfter: daysAgo(1) }), row({ outcome: 'open', unpaidAfter: null })]
    expect(cleanRecord(rows, 24, NOW)).toEqual({ clean: 2, settled: 1, unpaid: 1, open: 1, shops: 2, windowMonths: 24 })
  })

  it('counts clean and settled returns only inside the window', () => {
    const rows = [row({ closedAt: daysAgo(800) }), row({ outcome: 'settled', closedAt: daysAgo(800) }), row({ closedAt: daysAgo(30) })]
    expect(cleanRecord(rows, 24, NOW)).toMatchObject({ clean: 1, settled: 0 })
  })

  it('keeps an unpaid claim against the record whenever it was closed', () => {
    expect(cleanRecord([row({ outcome: 'open', unpaidAfter: daysAgo(900), closedAt: daysAgo(1000) })], 24, NOW)).toMatchObject({ unpaid: 1 })
  })

  it('leaves out rentals that do not count, except an unpaid claim', () => {
    expect(cleanRecord([row({ counts: false }), row({ counts: false, outcome: 'open', unpaidAfter: daysAgo(1) })], 24, NOW)).toMatchObject({ clean: 0, unpaid: 1 })
  })

  it('starts the window the given number of calendar months back', () => {
    expect(windowStart(24, NOW)).toEqual(new Date('2024-10-26T09:00:00Z'))
  })

  it('never counts more returns than it was given, and never fewer with a longer window', () => {
    const arbitraryRow = fc.record({
      outcome: fc.constantFrom('clean', 'settled', 'open'),
      closedAt: fc.integer({ min: 0, max: 1500 }).map(daysAgo),
      counts: fc.boolean(),
      unpaidAfter: fc.option(fc.integer({ min: -100, max: 100 }).map(daysAgo), { nil: null }),
      shop: fc.constantFrom('a', 'b', 'c'),
    })
    fc.assert(
      fc.property(fc.array(arbitraryRow), fc.integer({ min: 1, max: 35 }), (rows, months) => {
        const shorter = cleanRecord(rows, months, NOW)
        const longer = cleanRecord(rows, months + 1, NOW)
        expect(shorter.clean + shorter.settled + shorter.unpaid + shorter.open).toBeLessThanOrEqual(rows.length)
        expect(longer.clean).toBeGreaterThanOrEqual(shorter.clean)
        expect(shorter.shops).toBeLessThanOrEqual(3)
      }),
    )
  })
})
