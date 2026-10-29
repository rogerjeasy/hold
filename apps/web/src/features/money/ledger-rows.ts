import type { LedgerRecord, LedgerRental, MoneyLedgerRecords } from '@hold/db'
import { lineFlows, rentalMoney } from '@hold/domain'
import type { LineFlow, MoneyWhere, RentalMoney } from '@hold/domain'

// The money ledger's rows (extensions.md section 12.5): each line of the money log with what it did, its month on the
// shop's clock, and its rental's standing. What a line did and whether a rental's money agrees are the domain's rules,
// so the page says what the checks found.

export type LedgerRentalRow = LedgerRental & { readonly money: RentalMoney }
export type LedgerRow = LedgerRecord & { readonly flow: LineFlow; readonly month: string; readonly rental: LedgerRentalRow }

// "2026-10": a month as the shop's own clock counts it, which sorts as it reads.
function monthOf(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(at)
  return `${parts.find((part) => part.type === 'year')?.value ?? ''}-${parts.find((part) => part.type === 'month')?.value ?? ''}`
}

export function ledgerRows(records: MoneyLedgerRecords, timeZone: string): { readonly rows: LedgerRow[]; readonly rentals: LedgerRentalRow[] } {
  const rentals = records.rentals.map((rental): LedgerRentalRow => {
    const lines = records.lines.filter((line) => line.rentalId === rental.rentalId)
    return { ...rental, money: rentalMoney(lines, { reservedCents: rental.reservedCents, holdState: rental.holdState, claimCents: rental.claimCents, paypalDiffers: rental.paypalDiffers }) }
  })
  const flows = new Map<string, LineFlow>()
  for (const rental of rentals) {
    const lines = records.lines.filter((line) => line.rentalId === rental.rentalId)
    lineFlows(lines, rental.holdState).forEach((flow, index) => {
      const each = lines[index]
      if (each !== undefined) flows.set(each.id, flow)
    })
  }
  const rentalOf = new Map(rentals.map((rental) => [rental.rentalId, rental]))
  const rows = records.lines.flatMap((line) => {
    const rental = rentalOf.get(line.rentalId)
    const flow = flows.get(line.id)
    return rental === undefined || flow === undefined ? [] : [{ ...line, flow, month: monthOf(line.occurredAt, timeZone), rental }]
  })
  return { rows, rentals }
}

// Which rentals to show: all, those whose money stands in one place, or those a check found something in.
export type MoneyFilter = 'all' | Exclude<MoneyWhere, 'none'> | 'check'
export const MONEY_FILTERS: readonly MoneyFilter[] = ['all', 'held', 'taken', 'returned', 'invoiced', 'check']

const shows = (rental: LedgerRentalRow, filter: MoneyFilter) => filter === 'all' || (filter === 'check' ? rental.money.checks.length > 0 : rental.money.where === filter)

export function filterCounts(rentals: readonly LedgerRentalRow[]): Readonly<Record<MoneyFilter, number>> {
  return Object.fromEntries(MONEY_FILTERS.map((filter) => [filter, rentals.filter((rental) => shows(rental, filter)).length])) as Record<MoneyFilter, number>
}

// Every line of each rental shown, so a rental is always read whole.
export function visibleRows(rows: readonly LedgerRow[], filter: MoneyFilter): LedgerRow[] {
  return rows.filter((row) => shows(row.rental, filter))
}
