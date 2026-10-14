import { describe, expect, it } from 'vitest'
import { formatMoney } from './money'

const hold = { cents: 30000, currency: 'EUR' }

describe('formatMoney', () => {
  it('writes integer cents as a currency amount with two decimals', () => {
    expect(formatMoney(hold, 'en')).toBe('€300.00')
  })

  it('follows the reader locale for symbol position and separators', () => {
    expect(formatMoney(hold, 'de')).toBe('300,00 €')
  })

  it('drops the decimals in the short style when the amount is whole', () => {
    expect(formatMoney({ cents: 3500, currency: 'EUR' }, 'en', 'short')).toBe('€35')
  })

  it('keeps the decimals in the short style when there are cents', () => {
    expect(formatMoney({ cents: 3505, currency: 'EUR' }, 'en', 'short')).toBe('€35.05')
  })

  it('keeps large amounts exact', () => {
    expect(formatMoney({ cents: 900719925474099, currency: 'EUR' }, 'en')).toBe('€9,007,199,254,740.99')
  })

  it('refuses an amount that is not a whole number of cents', () => {
    expect(() => formatMoney({ cents: 10.5, currency: 'EUR' }, 'en')).toThrow(RangeError)
  })
})
