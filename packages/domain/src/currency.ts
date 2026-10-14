import { money } from './money.ts'
import type { Money } from './money.ts'

// The currencies a shop can price in: those PayPal accepts for authorizations and captures.
export const SHOP_CURRENCIES = ['AUD', 'CAD', 'CHF', 'CZK', 'DKK', 'EUR', 'GBP', 'HUF', 'JPY', 'NOK', 'NZD', 'PLN', 'SEK', 'USD'] as const
export type ShopCurrency = (typeof SHOP_CURRENCIES)[number]

// PayPal takes these in whole units, with no decimal part. Every other shop currency has two decimals.
const WHOLE_UNIT_CURRENCIES: ReadonlySet<string> = new Set(['HUF', 'JPY', 'TWD'])

export function isShopCurrency(code: string): code is ShopCurrency {
  return (SHOP_CURRENCIES as readonly string[]).includes(code)
}

export function decimalsOf(currency: string): 0 | 2 {
  return WHOLE_UNIT_CURRENCIES.has(currency) ? 0 : 2
}

// An amount as a person types it: "35", "35.50" or "35,50". No thousands separators, no sign, no currency symbol.
// Read digit by digit, so it never passes through a float. Nothing for anything else.
export function parseAmount(text: string, currency: string): Money | undefined {
  const match = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(text.trim())
  if (match === null) return undefined
  const units = Number(match[1])
  const fraction = match[2]
  if (decimalsOf(currency) === 0) return fraction === undefined || Number(fraction) === 0 ? money(units, currency) : undefined
  return money(units * 100 + Number((fraction ?? '').padEnd(2, '0')), currency)
}

// The plain form an amount is typed in, for a field that shows it back: "35.50".
export function amountText(amount: Money): string {
  if (decimalsOf(amount.currency) === 0) return String(amount.cents)
  return `${String(Math.floor(amount.cents / 100))}.${String(amount.cents % 100).padStart(2, '0')}`
}
