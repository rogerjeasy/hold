import type { Money } from './money.ts'

// A renter's Clean Record (extensions.md section 7.4): one outcome for each rental that closed, counted by plain
// code. There is no score and no judgment about a person, only counts.

export const OUTCOME_CLASSES = ['clean', 'settled', 'unpaid', 'open'] as const
export type OutcomeClass = (typeof OUTCOME_CLASSES)[number]

// What is written down. `unpaid` is never written: an open outcome becomes unpaid once its invoice is past due.
export const STORED_OUTCOMES = ['clean', 'settled', 'open'] as const
export type StoredOutcome = (typeof STORED_OUTCOMES)[number]

// How long an invoice for a decided claim has before it counts as unpaid. PayPal's usual term is net 30.
export const INVOICE_DUE_DAYS = 30

export const DEFAULT_WINDOW_MONTHS = 24

export type OutcomeRow = {
  readonly outcome: StoredOutcome
  readonly closedAt: Date
  // Whether the rental may build a record: its fee was captured through PayPal and it met the shop's minimums.
  readonly counts: boolean
  // When an open outcome's invoice falls due. Null while nothing is owed.
  readonly unpaidAfter: Date | null
  // Opaque, the same for rows of the same shop. Only the number of different shops leaves the record.
  readonly shop: string
}

export type CleanRecord = {
  readonly clean: number
  readonly settled: number
  readonly unpaid: number
  readonly open: number
  // How many different shops the counted returns were at.
  readonly shops: number
  readonly windowMonths: number
}

// A rental closes once its money is settled. Whatever happened on the way, it is clean if nothing was taken in the
// end: no claim, a waived claim, or a charge refunded in full. A dispute is not an input: opening one never counts.
export function closedOutcome(money: { readonly takenCents: number }): StoredOutcome {
  return money.takenCents > 0 ? 'settled' : 'clean'
}

export type RecordMinimums = { readonly fee: Money; readonly hours: number }

// A record cannot be built cheaply: only a rental whose fee PayPal captured, at or above the shop's minimum fee and
// length, counts. Simulated sample rentals never do.
export function countsTowardRecord(rental: { readonly feeCaptured: boolean; readonly fee: Money; readonly hours: number; readonly simulated: boolean }, minimums: RecordMinimums | undefined): boolean {
  if (!rental.feeCaptured || rental.simulated) return false
  if (minimums === undefined) return true
  return rental.fee.cents >= minimums.fee.cents && rental.hours >= minimums.hours
}

export function outcomeNow(row: OutcomeRow, now: Date): OutcomeClass {
  if (row.outcome === 'open' && row.unpaidAfter !== null && row.unpaidAfter.getTime() <= now.getTime()) return 'unpaid'
  return row.outcome
}

export function windowStart(windowMonths: number, now: Date): Date {
  const start = new Date(now)
  start.setUTCMonth(start.getUTCMonth() - windowMonths)
  return start
}

// Clean and settled returns count inside the window. An unpaid or open claim counts whenever it was closed, since it
// is still unresolved; an unpaid one counts even for a rental that could not build a record.
export function cleanRecord(rows: readonly OutcomeRow[], windowMonths: number, now: Date): CleanRecord {
  const since = windowStart(windowMonths, now).getTime()
  const counted = { clean: 0, settled: 0, unpaid: 0, open: 0 }
  const shops = new Set<string>()
  for (const row of rows) {
    const outcome = outcomeNow(row, now)
    if (outcome === 'unpaid') counted.unpaid += 1
    else if (!row.counts) continue
    else if (outcome === 'open') counted.open += 1
    else if (row.closedAt.getTime() >= since) {
      counted[outcome] += 1
      shops.add(row.shop)
    }
  }
  return { ...counted, shops: shops.size, windowMonths }
}
