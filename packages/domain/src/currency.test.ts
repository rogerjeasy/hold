import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { amountText, decimalsOf, parseAmount } from './currency.ts'
import { money } from './money.ts'

describe('parseAmount', () => {
  it.each([
    ['35', 35_00],
    ['35.5', 35_50],
    ['35.50', 35_50],
    ['35,50', 35_50],
    [' 0.05 ', 5],
  ])('reads %s as %i cents', (text, cents) => {
    expect(parseAmount(text, 'CHF')).toEqual(money(cents, 'CHF'))
  })

  it.each(['', '-5', '1.234', '1,000.00', '€5', '5e2', 'ten'])('reads "%s" as no amount', (text) => {
    expect(parseAmount(text, 'CHF')).toBeUndefined()
  })

  it('reads a whole-unit currency in units and refuses a fraction', () => {
    expect(parseAmount('5000', 'JPY')).toEqual(money(5000, 'JPY'))
    expect(parseAmount('50.50', 'JPY')).toBeUndefined()
  })

  it('reads back exactly what it writes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999_999_999 }), fc.constantFrom('CHF', 'JPY'), (cents, currency) => {
        expect(parseAmount(amountText(money(cents, currency)), currency)).toEqual(money(cents, currency))
      }),
    )
  })

  it('knows which currencies have no decimals', () => {
    expect([decimalsOf('EUR'), decimalsOf('HUF')]).toEqual([2, 0])
  })
})
