import { describe, expect, it } from 'vitest'
import { add, atMost, money, smaller, subtract } from './money.ts'

const chf = (cents: number) => money(cents, 'CHF')

describe('money', () => {
  it.each([12.5, -1, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('refuses %d cents', (cents) => {
    expect(() => money(cents, 'CHF')).toThrow(RangeError)
  })

  it('adds, subtracts and compares in one currency', () => {
    expect(add(chf(150_00), chf(40_05))).toEqual(chf(190_05))
    expect(subtract(chf(150_00), chf(40_05))).toEqual(chf(109_95))
    expect(smaller(chf(150_00), chf(40_05))).toEqual(chf(40_05))
    expect(atMost(chf(40_05), chf(40_05))).toBe(true)
    expect(atMost(chf(40_06), chf(40_05))).toBe(false)
  })

  it('refuses to go below zero', () => {
    expect(() => subtract(chf(1), chf(2))).toThrow(RangeError)
  })

  it('refuses to mix currencies', () => {
    expect(() => add(chf(1), money(1, 'EUR'))).toThrow(RangeError)
    expect(() => smaller(chf(1), money(1, 'EUR'))).toThrow(RangeError)
  })
})
