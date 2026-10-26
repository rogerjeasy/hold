import { money } from './money.ts'
import type { Money } from './money.ts'

// "Deposits never taken from you" (extensions.md section 7.9), read from the money log: each rental whose hold was
// released and never captured adds its hold once. A replacement releases the authorization before it for the same
// amount, so a rental counts its largest release, not their sum.

export type MoneyLogLine = { readonly rental: string; readonly kind: string; readonly amount: Money }

export type NeverTaken = { readonly amount: Money; readonly rentals: number }

export function neverTaken(lines: readonly MoneyLogLine[]): readonly NeverTaken[] {
  const captured = new Set(lines.filter((line) => line.kind === 'hold_captured').map((line) => line.rental))
  const released = new Map<string, Money>()
  for (const line of lines) {
    if (line.kind !== 'hold_released' || captured.has(line.rental)) continue
    const earlier = released.get(line.rental)
    if (earlier === undefined || line.amount.cents > earlier.cents) released.set(line.rental, line.amount)
  }
  const byCurrency = new Map<string, { cents: number; rentals: number }>()
  for (const amount of released.values()) {
    const sum = byCurrency.get(amount.currency) ?? { cents: 0, rentals: 0 }
    byCurrency.set(amount.currency, { cents: sum.cents + amount.cents, rentals: sum.rentals + 1 })
  }
  return [...byCurrency.entries()].sort(([first], [second]) => first.localeCompare(second)).map(([currency, sum]) => ({ amount: money(sum.cents, currency), rentals: sum.rentals }))
}
