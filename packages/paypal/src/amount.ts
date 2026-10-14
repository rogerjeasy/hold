import { decimalsOf } from '@hold/domain'
import type { Money } from '@hold/domain'

export type PayPalAmount = {
  readonly currency_code: string
  readonly value: string
}

const CENTS_PER_UNIT = 100
const DECIMAL_SHAPE = /^(\d+)(?:\.(\d{1,2}))?$/

export function toPayPalAmount(money: Money): PayPalAmount {
  if (!Number.isSafeInteger(money.cents) || money.cents < 0) {
    throw new RangeError('An amount sent to PayPal must be a whole, non-negative number of cents.')
  }
  if (decimalsOf(money.currency) === 0) {
    return { currency_code: money.currency, value: String(money.cents) }
  }
  const cents = money.cents % CENTS_PER_UNIT
  const units = (money.cents - cents) / CENTS_PER_UNIT
  return { currency_code: money.currency, value: `${String(units)}.${String(cents).padStart(2, '0')}` }
}

// Reads PayPal's decimal string digit by digit, so the amount never becomes a float. Returns nothing if it is not an amount.
export function fromPayPalAmount(amount: PayPalAmount): Money | undefined {
  const match = DECIMAL_SHAPE.exec(amount.value)
  if (match === null) return undefined
  const units = Number(match[1])
  const fraction = Number((match[2] ?? '').padEnd(2, '0'))
  const wholeUnits = decimalsOf(amount.currency_code) === 0
  if (wholeUnits && fraction !== 0) return undefined
  const cents = wholeUnits ? units : units * CENTS_PER_UNIT + fraction
  return Number.isSafeInteger(cents) ? { cents, currency: amount.currency_code } : undefined
}
