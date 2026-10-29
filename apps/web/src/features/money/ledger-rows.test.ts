import type { LedgerRecord, LedgerRental, MoneyLedgerRecords } from '@hold/db'
import { describe, expect, it } from 'vitest'
import { filterCounts, ledgerRows, visibleRows } from './ledger-rows'

// The money ledger's rows (extensions.md section 12.5): each line of the money log with what it did, its month on the
// shop's clock and its rental's standing, worked out by the domain's rules so the page and the checks agree.

const rental = (id: string, overrides: Partial<LedgerRental> = {}): LedgerRental => ({
  rentalId: id, renterName: `Renter ${id}`, startsAt: new Date('2026-09-30T08:00:00Z'), endsAt: new Date('2026-10-02T18:00:00Z'), simulated: false, currency: 'EUR',
  reservedCents: 250_00, holdState: 'captured', trustRung: null, ordinaryCents: null, claimCents: 35_00, paypalDiffers: false, audit: [], ...overrides,
})
const line = (id: string, rentalId: string, kind: LedgerRecord['kind'], amountCents: number, occurredAt: string): LedgerRecord => ({
  id, rentalId, kind, currency: 'EUR', amountCents, paypalFeeCents: null, netCents: null, paypalReference: `REF-${id}`, occurredAt: new Date(occurredAt), recordedAt: new Date(occurredAt), event: null, execution: null,
})
const records: MoneyLedgerRecords = {
  lines: [
    line('1', 'a', 'hold_placed', 250_00, '2026-09-30T23:30:00Z'),
    line('2', 'a', 'hold_captured', 35_00, '2026-10-03T10:00:00Z'),
    line('3', 'a', 'hold_released', 215_00, '2026-10-03T10:00:00Z'),
    line('4', 'b', 'hold_placed', 180_00, '2026-10-10T09:00:00Z'),
    line('5', 'c', 'hold_placed', 90_00, '2026-10-11T09:00:00Z'),
    line('6', 'c', 'hold_captured', 95_00, '2026-10-12T09:00:00Z'),
  ],
  rentals: [rental('a'), rental('b', { reservedCents: 180_00, holdState: 'placed', claimCents: null }), rental('c', { reservedCents: 90_00, claimCents: 95_00 })],
}

describe('the money ledger’s rows', () => {
  it('gives each line what it did, its month on the shop’s clock and its rental’s standing', () => {
    const { rows } = ledgerRows(records, 'Europe/Lisbon')
    expect(rows.map((row) => [row.id, row.flow, row.month])).toEqual([['1', 'held', '2026-10'], ['2', 'to_shop', '2026-10'], ['3', 'to_renter', '2026-10'], ['4', 'held', '2026-10'], ['5', 'held', '2026-10'], ['6', 'to_shop', '2026-10']])
    expect(ledgerRows(records, 'UTC').rows[0]?.month).toBe('2026-09')
    expect(rows[0]?.rental.money).toMatchObject({ toShopCents: 35_00, backCents: 215_00, where: 'taken', checks: [] })
    expect(rows.find((row) => row.rentalId === 'c')?.rental.money.checks).toEqual(['captured_above_hold'])
  })

  it('counts the rentals by where their money is, and those that need a look, and shows a rental’s every line', () => {
    const { rows, rentals } = ledgerRows(records, 'UTC')
    expect(filterCounts(rentals)).toEqual({ all: 3, held: 1, taken: 2, returned: 0, invoiced: 0, check: 1 })
    expect(visibleRows(rows, 'held').map((row) => row.id)).toEqual(['4'])
    expect(visibleRows(rows, 'check').map((row) => row.id)).toEqual(['5', '6'])
    expect(visibleRows(rows, 'all')).toHaveLength(6)
  })
})
