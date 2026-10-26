import { decimalsOf } from './currency.ts'
import type { Money } from './money.ts'

// The number guard (architecture.md section 10.4). A message a model wrote for a renter is kept only if every number
// in it is one of the amounts plain code read from the database. Otherwise it is dropped and the caller uses a fixed
// template. A renter never reads an amount, a count or a time that the record does not hold.

// Digits, with the separators people put inside a number: "35", "35.00", "35,00", "1'200.50", and spaces.
const NUMBER = /\d+(?:[.,'\u2019 \u00a0\u202f]\d+)*/g
const SEPARATOR = /[.,'\u2019 \u00a0\u202f]/

// A number as an amount in the currency's smallest unit, read by the currency's rules: a decimal part has exactly the
// currency's decimal digits after a point or a comma; thousands groups have exactly three digits; a number with no
// decimal part counts whole units, so "3500" is never 35.00. Undefined for anything written otherwise.
function readAmount(text: string, currency: string): number | undefined {
  const decimals = decimalsOf(currency)
  const parts = text.split(SEPARATOR)
  const separators = text.replace(/\d/g, '').split('')
  let fraction = 0
  const last = parts.at(-1) ?? ''
  const lastSeparator = separators.at(-1)
  if (decimals > 0 && parts.length > 1 && (lastSeparator === '.' || lastSeparator === ',') && last.length === decimals) {
    // The decimal separator is not also a thousands separator: "1,200,50" is no amount.
    if (separators.slice(0, -1).includes(lastSeparator)) return undefined
    fraction = Number(last)
    parts.pop()
  }
  const [first = '', ...groups] = parts
  if (first.length > 1 && first.startsWith('0')) return undefined
  if (groups.length > 0 && (first.length > 3 || groups.some((group) => group.length !== 3))) return undefined
  return Number(parts.join('')) * 10 ** decimals + fraction
}

export function guardNumbers(text: string, allowed: readonly Money[]): string | null {
  const found = text.match(NUMBER) ?? []
  return found.every((number) => allowed.some((amount) => readAmount(number, amount.currency) === amount.cents)) ? text : null
}
