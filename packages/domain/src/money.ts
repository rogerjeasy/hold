// An amount in the currency's smallest unit, with its ISO 4217 code. Never a float.
export type Money = {
  readonly cents: number
  readonly currency: string
}

export function money(cents: number, currency: string): Money {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError('An amount must be a whole, non-negative number of cents.')
  }
  return { cents, currency }
}

export function zero(currency: string): Money {
  return money(0, currency)
}

export function add(a: Money, b: Money): Money {
  return money(a.cents + b.cents, sameCurrency(a, b))
}

// Refuses to go below zero: an amount that would be negative is a bug in the caller.
export function subtract(a: Money, b: Money): Money {
  return money(a.cents - b.cents, sameCurrency(a, b))
}

export function smaller(a: Money, b: Money): Money {
  sameCurrency(a, b)
  return a.cents <= b.cents ? a : b
}

export function atMost(a: Money, limit: Money): boolean {
  sameCurrency(a, limit)
  return a.cents <= limit.cents
}

// Amounts in different currencies never meet in Hold: a shop has one currency. Mixing them is a bug, not a user error.
function sameCurrency(a: Money, b: Money): string {
  if (a.currency !== b.currency) {
    throw new RangeError(`Cannot combine ${a.currency} with ${b.currency}.`)
  }
  return a.currency
}
