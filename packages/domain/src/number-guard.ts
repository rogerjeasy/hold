import { decimalsOf } from './currency.ts'
import type { Money } from './money.ts'

// The number guard (architecture.md section 10.4). A message a model wrote for a renter is kept only if every number
// in it is one of the amounts plain code read from the database. Otherwise it is dropped and the caller uses a fixed
// template. A renter never reads an amount, a count or a time that the record does not hold.

// Digits, with the separators people put inside a number: "35", "35.00", "35,00", "1'200.50", and spaces.
const NUMBER = /\d+(?:[.,'\u2019 \u00a0\u202f]\d+)*/g

// The ways an amount may be written, as its digits alone: 35.00 EUR is "3500", or "35" when it has no cents.
function writings(amount: Money): readonly string[] {
  if (decimalsOf(amount.currency) === 0) return [String(amount.cents)]
  const units = String(Math.floor(amount.cents / 100))
  return amount.cents % 100 === 0 ? [String(amount.cents), units] : [String(amount.cents)]
}

export function guardNumbers(text: string, allowed: readonly Money[]): string | null {
  const accepted = new Set(allowed.flatMap(writings))
  const found = text.match(NUMBER) ?? []
  return found.every((number) => accepted.has(number.replace(/\D/g, ''))) ? text : null
}
