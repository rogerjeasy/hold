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
  ])('drops a message with any other number: %s', (text) => {
    expect(guardNumbers(text, [price])).toBeNull()
  })

  it('drops any number when no price was read', () => {
    expect(guardNumbers('It costs 35 EUR.', [])).toBeNull()
    expect(guardNumbers('We recorded it.', [])).toBe('We recorded it.')
  })

  it('reads whole-unit currencies as they are written', () => {
    expect(guardNumbers('The price is 3500 JPY.', [money(3500, 'JPY')])).toBe('The price is 3500 JPY.')
    expect(guardNumbers('The price is 35 JPY.', [money(3500, 'JPY')])).toBeNull()
  })

  it('never lets through an amount other than the price, whatever the amount', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 1_000_000 }), (cents) => {
      fc.pre(cents !== price.cents && cents !== price.cents / 100)
      const units = `${String(Math.floor(cents / 100))}.${String(cents % 100).padStart(2, '0')}`
      expect(guardNumbers(`The price is ${units} EUR.`, [price])).toBeNull()
    }))
  })
})
