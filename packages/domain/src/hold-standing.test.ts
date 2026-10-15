import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addDays, HOLD_VALIDITY_DAYS } from './hold-clocks.ts'
import { holdDay, holdStanding } from './hold-standing.ts'

const placed = new Date('2026-10-01T10:00:00Z')
const clocks = { createdAt: placed, assuredUntil: addDays(placed, 3), validUntil: addDays(placed, 29) }

describe('where a hold stands', () => {
  it('is assured for its first three days', () => {
    expect(holdStanding(clocks, addDays(placed, 2.9))).toBe('assured')
  })

  it('is still valid after the assured period', () => {
    expect(holdStanding(clocks, addDays(placed, 3))).toBe('valid')
    expect(holdStanding(clocks, addDays(placed, 25.9))).toBe('valid')
  })

  it('is ending in its last three days, and after', () => {
    expect(holdStanding(clocks, addDays(placed, 26))).toBe('ending')
    expect(holdStanding(clocks, addDays(placed, 30))).toBe('ending')
  })

  it('counts days from one, and stops at the last', () => {
    expect(holdDay(clocks, placed)).toBe(1)
    expect(holdDay(clocks, addDays(placed, 25.5))).toBe(26)
    expect(holdDay(clocks, addDays(placed, 40))).toBe(HOLD_VALIDITY_DAYS)
  })

  it('never moves backwards as time passes', () => {
    const order = ['assured', 'valid', 'ending']
    fc.assert(
      fc.property(fc.double({ min: 0, max: 40, noNaN: true }), fc.double({ min: 0, max: 40, noNaN: true }), (a, b) => {
        const [early, late] = a <= b ? [a, b] : [b, a]
        expect(order.indexOf(holdStanding(clocks, addDays(placed, early)))).toBeLessThanOrEqual(order.indexOf(holdStanding(clocks, addDays(placed, late))))
        expect(holdDay(clocks, addDays(placed, early))).toBeLessThanOrEqual(holdDay(clocks, addDays(placed, late)))
      }),
    )
  })
})
