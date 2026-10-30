import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { daysOut, itemWear, recoveredCents, wearingFastest } from './fleet.ts'
import type { ItemRentalRecord } from './fleet.ts'

// The fleet passport (extensions.md section 12.5): what each item's rentals say about it, read by plain code from its
// findings, claim lines and the money PayPal collected, so the shop can tell which item is wearing fastest.

const day = (n: number, hour = 10) => new Date(Date.UTC(2026, 9, n, hour))
const YEAR = { start: new Date(Date.UTC(2026, 0, 1)), end: new Date(Date.UTC(2027, 0, 1)) }
const rental = (overrides: Partial<ItemRentalRecord> = {}): ItemRentalRecord => ({ rentalId: 'r', startsAt: day(1), endsAt: day(3), damageFindings: 0, claimLinesCents: 0, claimTotalCents: null, collectedCents: 0, ...overrides })

describe('days out', () => {
  it('counts each rental’s days within the window, a part day as a whole one', () => {
    expect(daysOut([rental({ startsAt: day(1), endsAt: day(3) }), rental({ startsAt: day(5, 9), endsAt: day(5, 17) })], YEAR)).toBe(3)
  })

  it('counts only the part of a rental inside the window', () => {
    expect(daysOut([rental({ startsAt: new Date(Date.UTC(2025, 11, 30)), endsAt: new Date(Date.UTC(2026, 0, 2)) })], YEAR)).toBe(1)
    expect(daysOut([rental({ startsAt: new Date(Date.UTC(2025, 5, 1)), endsAt: new Date(Date.UTC(2025, 5, 4)) })], YEAR)).toBe(0)
  })
})

describe('what an item’s damage cost and what was recovered', () => {
  it('recovers the item’s share of what was collected on the claim, never more than its lines', () => {
    expect(recoveredCents(rental({ claimLinesCents: 35_00, claimTotalCents: 80_00, collectedCents: 80_00 }))).toBe(35_00)
    expect(recoveredCents(rental({ claimLinesCents: 35_00, claimTotalCents: 80_00, collectedCents: 40_00 }))).toBe(17_50)
    expect(recoveredCents(rental({ claimLinesCents: 35_00, claimTotalCents: 80_00, collectedCents: 120_00 }))).toBe(35_00)
    expect(recoveredCents(rental({ claimLinesCents: 35_00, claimTotalCents: null, collectedCents: 0 }))).toBe(0)
  })

  it('never recovers more than the item’s lines or less than nothing, for any claim', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 500_00 }), fc.integer({ min: 0, max: 500_00 }), fc.integer({ min: 0, max: 1_000_00 }), (lines, rest, collected) => {
        const recovered = recoveredCents(rental({ claimLinesCents: lines, claimTotalCents: lines + rest, collectedCents: collected }))
        expect(Number.isInteger(recovered)).toBe(true)
        expect(recovered).toBeGreaterThanOrEqual(0)
        expect(recovered).toBeLessThanOrEqual(lines)
      }),
    )
  })
})

describe('an item’s wear', () => {
  it('adds up its rentals, its damage findings rental by rental, oldest first, what the damage cost and what was recovered', () => {
    const wear = itemWear([
      rental({ rentalId: 'b', startsAt: day(10), endsAt: day(12), damageFindings: 1, claimLinesCents: 35_00, claimTotalCents: 35_00, collectedCents: 35_00 }),
      rental({ rentalId: 'a', startsAt: day(1), endsAt: day(3) }),
      rental({ rentalId: 'c', startsAt: day(20), endsAt: day(21), damageFindings: 2, claimLinesCents: 90_00, claimTotalCents: 90_00, collectedCents: 0 }),
    ], YEAR)
    expect(wear).toEqual({ rentals: 3, damageFindings: 3, findingsByRental: [0, 1, 2], incurredCents: 125_00, recoveredCents: 35_00, daysOut: 5 })
  })

  it('keeps the last twelve rentals for the line of findings', () => {
    const rentals = Array.from({ length: 15 }, (_, index) => rental({ rentalId: String(index), startsAt: day(index + 1), endsAt: day(index + 1, 18), damageFindings: index }))
    expect(itemWear(rentals, YEAR).findingsByRental).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
  })
})

describe('which items are wearing fastest', () => {
  const wear = (rentals: number, damageFindings: number) => ({ rentals, damageFindings })

  it('names, within each type, the items with the most damage per rental, when another item of the type has less', () => {
    expect(wearingFastest([
      { itemId: 'e1', typeId: 'ebike', ...wear(4, 2) },
      { itemId: 'e2', typeId: 'ebike', ...wear(4, 0) },
      { itemId: 'e3', typeId: 'ebike', ...wear(2, 1) },
      { itemId: 'k1', typeId: 'kayak', ...wear(3, 1) },
      { itemId: 'k2', typeId: 'kayak', ...wear(3, 1) },
    ])).toEqual(new Set(['e1', 'e3']))
  })

  it('names nothing in a type with no damage, a single item, or items never rented', () => {
    expect(wearingFastest([{ itemId: 'a', typeId: 't', ...wear(5, 0) }, { itemId: 'b', typeId: 't', ...wear(5, 0) }])).toEqual(new Set())
    expect(wearingFastest([{ itemId: 'a', typeId: 't', ...wear(5, 3) }])).toEqual(new Set())
    expect(wearingFastest([{ itemId: 'a', typeId: 't', ...wear(0, 0) }, { itemId: 'b', typeId: 't', ...wear(0, 0) }])).toEqual(new Set())
  })
})

describe('what repairs cost against what damage recovered', () => {
  it('is the recovered amount less the cost of the repairs done, once one was done', async () => {
    const { repairMargin } = await import('./fleet.ts')
    expect(repairMargin(90_00, { done: 1, doneCostCents: 62_00, open: 0 })).toBe(28_00)
    expect(repairMargin(35_00, { done: 2, doneCostCents: 71_50, open: 1 })).toBe(-36_50)
    expect(repairMargin(90_00, { done: 0, doneCostCents: 0, open: 1 })).toBeNull()
  })
})
