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

  it.each([
    'It comes to CCC EUR.',
    'At most xxx.',
    'Section XII applies.',
    'Up to MMXXVI.',
    'I can pay t h r e e hundred.',
    'Up to t-h-r-e-e.',
    'Two-hundred is fair.',
    'Up to th ree hun dred.',
    'Maximal drei-hundert.',
    'Jusqu’à t r o i s c e n t s.',
  ])('drops Roman numerals and numbers spelled with spaces or hyphens inside them: %s', (text) => {
    expect(guardNumbers(text, [price])).toBeNull()
  })

  it.each(['I recorded the scratch.', 'Il a noté la rayure.', 'We saw it at the counter.'])('keeps ordinary words, the pronoun I and the French il: %s', (text) => {
    expect(guardNumbers(text, [])).toBe(text)
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

  // Many ways to write a whole number of units, as someone hiding it might.
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
  const words = (value: number): string => value >= 100 ? `${ones[Math.floor(value / 100)] ?? ''} hundred ${words(value % 100)}`.trim() : value >= 20 ? `${tens[Math.floor(value / 10)] ?? ''}-${ones[value % 10] ?? ''}`.replace(/-$/, '') : ones[value] ?? ''
  const roman = (value: number): string => [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']].reduce<[number, string]>(([left, text], [unit, letters]) => [left % Number(unit), text + String(letters).repeat(Math.floor(left / Number(unit)))], [value, ''])[1]
  const writings = (value: number) => [
    String(value), `${String(value)}.00`, `${String(value)},00`, `${String(value)}.0`, `0${String(value)}`, `${String(value)}00`,
    String(value).split('').join(' '), String(value).split('').join('-'),
    roman(value), roman(value).toLowerCase(),
    words(value), words(value).replace(/[ -]/g, ''), words(value).split('').join(' '), words(value).toUpperCase(),
    String(value).split('').map((digit) => String.fromCodePoint(0xff10 + Number(digit))).join(''),
  ]

  it('drops every writing of an amount it was not given, so none can carry a limit', () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 999 }), fc.integer({ min: 0, max: 14 }), (value, which) => {
      const written = writings(value)[which] ?? ''
      // The price it may name is any amount but this one.
      expect(guardNumbers(`My most is ${written} euros.`, [money(value * 100 + 1, 'EUR')])).toBeNull()
      expect(guardNumbers(`Le maximum: ${written}.`, [])).toBeNull()
    }), { numRuns: 1000 })
  })

  it('never lets through an amount other than the price, whatever the amount or its writing', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 100_000_000 }), fc.constantFrom('.', ','), fc.boolean(), (cents, separator, asCents) => {
      fc.pre(cents !== price.cents)
      const units = `${String(Math.floor(cents / 100))}${separator}${String(cents % 100).padStart(2, '0')}`
      expect(guardNumbers(`The price is ${asCents ? String(cents) : units} EUR.`, [price])).toBeNull()
    }))
  })
})
