import { describe, expect, it } from 'vitest'
import { fromPayPalAmount, toPayPalAmount } from './amount.ts'

describe('toPayPalAmount', () => {
  it.each([
    [150_00, '150.00'],
    [40_05, '40.05'],
    [7, '0.07'],
    [0, '0.00'],
  ])('writes %i cents as %s', (cents, value) => {
    expect(toPayPalAmount({ cents, currency: 'EUR' })).toEqual({ currency_code: 'EUR', value })
  })

  it('writes a currency PayPal takes in whole units without a decimal part', () => {
    expect(toPayPalAmount({ cents: 5000, currency: 'JPY' })).toEqual({ currency_code: 'JPY', value: '5000' })
  })

  it.each([12.5, -1, Number.NaN])('refuses %d, which is not a whole, non-negative number of cents', (cents) => {
    expect(() => toPayPalAmount({ cents, currency: 'EUR' })).toThrow(RangeError)
  })
})

describe('fromPayPalAmount', () => {
  it.each([
    ['150.00', 150_00],
    ['40.05', 40_05],
    ['0.1', 10],
    ['12', 12_00],
  ])('reads %s as %i cents', (value, cents) => {
    expect(fromPayPalAmount({ currency_code: 'USD', value })).toEqual({ cents, currency: 'USD' })
  })

  it('reads a whole-unit currency as its units', () => {
    expect(fromPayPalAmount({ currency_code: 'JPY', value: '5000' })).toEqual({ cents: 5000, currency: 'JPY' })
  })

  it.each(['', '-5.00', '1.234', '1e3', 'ten', '1,50'])('reads "%s" as no amount', (value) => {
    expect(fromPayPalAmount({ currency_code: 'USD', value })).toBeUndefined()
  })

  it('refuses a fraction in a whole-unit currency', () => {
    expect(fromPayPalAmount({ currency_code: 'JPY', value: '50.50' })).toBeUndefined()
  })

  it('reads back exactly what it wrote, with no float drift', () => {
    const money = { cents: 1_234_567_89, currency: 'USD' }
    expect(fromPayPalAmount(toPayPalAmount(money))).toEqual(money)
  })
})
