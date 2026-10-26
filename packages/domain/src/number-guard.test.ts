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

  it.each([
    'I could go up to three hundred euros.',
    'Thirty is my most.',
    'Twenty-five would do.',
    'Je peux payer trois cents euros.',
    'Pas plus de quarante.',
    'Quatre-vingt-dix, au maximum.',
    'Puedo pagar trescientos euros.',
    'Hasta veintitrés.',
    'Cincuenta como mucho.',
    'Ich zahle höchstens dreihundert Euro.',
    'Fünfundzwanzig reichen.',
    'Nicht mehr als dreißig.',
    'Zwölf Euro.',
    'One thousand is too much.',
  ])('drops a number written in words, in English, French, Spanish or German: %s', (text) => {
    expect(guardNumbers(text, [price])).toBeNull()
  })

  it.each([
    'We settle at 60 % of the claim.',
    'Sixty percent of it.',
    'Soixante pour cent.',
    'El sesenta por ciento.',
    'Sechzig Prozent.',
    'At 60％.',
    'At 6‰.',
  ])('drops a share of anything: %s', (text) => {
    expect(guardNumbers(text, [price])).toBeNull()
  })

  it.each([
    'The price is ٣٥ EUR.',
    'The price is ३५ EUR.',
    'The price is ３５ EUR.',
    'The price is ³⁵ EUR.',
    'The price is ① EUR.',
    'The price is Ⅻ EUR.',
  ])('drops digits from any other script, even where they spell an allowed amount: %s', (text) => {
    expect(guardNumbers(text, [price])).toBeNull()
  })

  it.each([
    'Nous avons noté une rayure et un éclat.',
    'Wir haben eine Delle und einen Kratzer notiert.',
    'Hay una marca y un rasguño.',
  ])('keeps the article that is also the word for one in French, German and Spanish: %s', (text) => {
    expect(guardNumbers(text, [])).toBe(text)
  })

  it('drops a side’s own limit in any written form, even where it is an allowed amount', () => {
    const limit = money(30_00, 'EUR')
    for (const text of ['I offer 30.00.', 'I offer 30,00.', 'I offer 30 euros.', 'That is 3000 cents.']) expect(guardNumbers(text, [limit], { amounts: [limit] })).toBeNull()
    expect(guardNumbers('I offer 30.00.', [limit])).toBe('I offer 30.00.')
    // A share is forbidden as a bare number too.
    expect(guardNumbers('It stands at 60.00.', [money(60_00, 'EUR')], { wholeNumbers: [60] })).toBeNull()
    expect(guardNumbers('It stands at 35.00.', [price], { wholeNumbers: [60] })).toBe('It stands at 35.00.')
  })

  it('drops any number written in another script’s digits, whatever the number', () => {
    const scripts = [0x0660, 0x06f0, 0x0966, 0x09e6, 0x0e50, 0xff10, 0x1040]
    fc.assert(fc.property(fc.integer({ min: 0, max: 99_999 }), fc.constantFrom(...scripts), (value, zero) => {
      const written = String(value).split('').map((digit) => String.fromCodePoint(zero + Number(digit))).join('')
      expect(guardNumbers(`The price is ${written} EUR.`, [money(value * 100, 'EUR'), money(value, 'EUR')])).toBeNull()
    }))
  })

  it('drops any number word from the four languages, in any case and inside any sentence', () => {
    const words = ['zero', 'two', 'seven', 'twelve', 'nineteen', 'forty', 'hundred', 'thousand', 'zéro', 'deux', 'dix', 'seize', 'vingt', 'cent', 'mille', 'cero', 'dos', 'quince', 'veinte', 'cien', 'mil', 'null', 'zwei', 'elf', 'zwanzig', 'hundert', 'tausend']
    fc.assert(fc.property(fc.constantFrom(...words), fc.constantFrom('upper', 'lower', 'title'), fc.string({ maxLength: 20 }).filter((text) => !/[\p{N}%]/u.test(text)), (word, casing, around) => {
      const cased = casing === 'upper' ? word.toUpperCase() : casing === 'lower' ? word : word.charAt(0).toUpperCase() + word.slice(1)
      expect(guardNumbers(`${around} ${cased} ${around}`, [price])).toBeNull()
    }))
  })

  it('never lets through an amount other than the price, whatever the amount or its writing', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 100_000_000 }), fc.constantFrom('.', ','), fc.boolean(), (cents, separator, asCents) => {
      fc.pre(cents !== price.cents)
      const units = `${String(Math.floor(cents / 100))}${separator}${String(cents % 100).padStart(2, '0')}`
      expect(guardNumbers(`The price is ${asCents ? String(cents) : units} EUR.`, [price])).toBeNull()
    }))
  })
})
