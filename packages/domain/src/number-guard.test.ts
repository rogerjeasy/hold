import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { money } from './money.ts'
import { guardNumbers } from './number-guard.ts'

const price = money(35_00, 'EUR')

describe('the number guard', () => {
  it.each([
    'We recorded the scratch. The published price is 35 EUR.',
    'Nous avons noté la rayure. Le prix publié est de 35,00 €.',
    'The published price is €35.00, charged only at the return.',
    'Wir haben den Kratzer notiert.',
  ])('keeps a message whose only amount is the price read by code: %s', (text) => {
    expect(guardNumbers(text, [price])).toBe(text)
  })

  it.each([
    'The published price is 40 EUR.',
    'The price is 35 EUR, plus 5 EUR handling.',
    'The price is 3.50 EUR.',
    'Please return it by 10:30.',
    'You have 2 scratches.',
    // A count of cents is not an amount: 3500 EUR is not 35.00 EUR.
    'The price is 3500 EUR.',
    'The price is 35.00.0 EUR.',
    'The price is 35.000 EUR.',
    'The price is 35.0 EUR.',
    'The price is 3,5 EUR.',
    'The price is 3,50,0 EUR.',
  ])('drops a message with any other number, or a number written against the currency’s rules: %s', (text) => {
    expect(guardNumbers(text, [price])).toBeNull()
  })

  it('reads thousands groups of exactly three digits', () => {
    const large = money(1_200_50, 'CHF')
    for (const text of ['It is 1’200.50 CHF.', 'It is 1,200.50 CHF.', 'It is 1.200,50 CHF.', 'It is 1 200,50 CHF.', 'It is 1200.50 CHF.']) expect(guardNumbers(text, [large])).toBe(text)
    for (const text of ['It is 1,20.50 CHF.', 'It is 12,00.50 CHF.', 'It is 120050 CHF.']) expect(guardNumbers(text, [large])).toBeNull()
  })

  it('drops any number when no price was read', () => {
    expect(guardNumbers('It costs 35 EUR.', [])).toBeNull()
    expect(guardNumbers('We recorded it.', [])).toBe('We recorded it.')
  })

  it('reads whole-unit currencies as they are written, with no decimals', () => {
    expect(guardNumbers('The price is 3500 JPY.', [money(3500, 'JPY')])).toBe('The price is 3500 JPY.')
    expect(guardNumbers('The price is 3,500 JPY.', [money(3500, 'JPY')])).toBe('The price is 3,500 JPY.')
    expect(guardNumbers('The price is 35 JPY.', [money(3500, 'JPY')])).toBeNull()
    expect(guardNumbers('The price is 3500.00 JPY.', [money(3500, 'JPY')])).toBeNull()
  })

  it('never lets through an amount other than the price, whatever the amount or its writing', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 100_000_000 }), fc.constantFrom('.', ','), fc.boolean(), (cents, separator, asCents) => {
      fc.pre(cents !== price.cents)
      const units = `${String(Math.floor(cents / 100))}${separator}${String(cents % 100).padStart(2, '0')}`
      expect(guardNumbers(`The price is ${asCents ? String(cents) : units} EUR.`, [price])).toBeNull()
    }))
  })
})
