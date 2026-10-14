import type { Money } from '@hold/domain'

export type { Money }

export type MoneyStyle = 'exact' | 'short'

const CENTS_PER_UNIT = 100

export function formatMoney(money: Money, locale: string, style: MoneyStyle = 'exact'): string {
  if (!Number.isSafeInteger(money.cents)) {
    throw new RangeError('An amount must be a whole number of cents.')
  }
  const cents = money.cents % CENTS_PER_UNIT
  const units = (money.cents - cents) / CENTS_PER_UNIT
  // Intl reads a decimal string exactly, so the amount never becomes a float.
  const decimal: `${number}` = `${String(units)}.${String(Math.abs(cents)).padStart(2, '0')}` as `${number}`
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
    trailingZeroDisplay: style === 'short' ? 'stripIfInteger' : 'auto',
  }).format(decimal)
}
