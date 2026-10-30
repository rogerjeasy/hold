import type { CatalogItem, CatalogType, FleetItemRecord, ItemCatalog } from '@hold/db'
import type { ItemRentalRecord } from '@hold/domain'
import { describe, expect, it } from 'vitest'
import { fleetRows } from './fleet-rows'

// The fleet passport's rows (extensions.md section 12.5): each item type with its items below it, each item with what
// its rentals say about it, read by the domain's itemWear and wearingFastest, filtered as the items page is.

const type = (id: string, name: string): CatalogType => ({ id, name, category: 'e_bike', currency: 'EUR', valueCents: 2400_00, holdCents: 300_00, dayRateCents: 45_00, accessories: [], photoPlanId: 'plan', views: [], simulated: false })
const item = (id: string, typeId: string, standing: CatalogItem['standing'] = 'available'): CatalogItem => ({ id, itemTypeId: typeId, label: id, size: null, serial: null, status: 'in_service', statusNote: null, statusSince: null, standing, rental: undefined, simulated: false })
const rental = (n: number, damageFindings: number): ItemRentalRecord => ({ rentalId: `r${String(n)}`, startsAt: new Date(Date.UTC(2026, 9, n, 9)), endsAt: new Date(Date.UTC(2026, 9, n + 1, 9)), damageFindings, claimLinesCents: damageFindings * 35_00, claimTotalCents: damageFindings > 0 ? damageFindings * 35_00 : null, collectedCents: damageFindings * 35_00 })
const catalog: ItemCatalog = { types: [type('ebike', 'City e-bike'), type('kayak', 'Kayak')], items: [item('e1', 'ebike'), item('e2', 'ebike', 'in_repair'), item('k1', 'kayak', 'retired')] }
const records: FleetItemRecord[] = [
  { itemId: 'e1', rentals: [rental(1, 1), rental(5, 1)], openMarks: 2, repairs: { done: 1, doneCostCents: 52_00, open: 1 } },
  { itemId: 'e2', rentals: [rental(2, 0)], openMarks: 0, repairs: { done: 0, doneCostCents: 0, open: 0 } },
  { itemId: 'k1', rentals: [], openMarks: 0, repairs: { done: 0, doneCostCents: 0, open: 0 } },
]
const YEAR = { start: new Date(Date.UTC(2026, 0, 1)), end: new Date(Date.UTC(2027, 0, 1)) }

describe('the fleet passport’s rows', () => {
  it('puts each type above its items, each item with its wear, its open marks and whether it is wearing fastest', () => {
    const rows = fleetRows(catalog, records, YEAR, 'all')
    // The kayak's one item is retired, which only its own filter shows; with every item shown the type stays.
    expect(rows.map((row) => row.path)).toEqual([['ebike'], ['ebike', 'e1'], ['ebike', 'e2'], ['kayak']])
    const e1 = rows.find((row) => row.kind === 'item' && row.item.id === 'e1')
    expect(e1).toMatchObject({ kind: 'item', openMarks: 2, fastest: true, wear: { rentals: 2, damageFindings: 2, findingsByRental: [1, 1], incurredCents: 70_00, recoveredCents: 70_00, daysOut: 2 } })
    expect(rows.find((row) => row.kind === 'item' && row.item.id === 'e2')).toMatchObject({ fastest: false })
  })

  it('carries what the item’s repairs cost, how many are open, and what damage recovered less that', () => {
    const rows = fleetRows(catalog, records, YEAR, 'all')
    expect(rows.find((row) => row.kind === 'item' && row.item.id === 'e1')).toMatchObject({ repairCostCents: 52_00, openRepairs: 1, repairMarginCents: 18_00 })
    expect(rows.find((row) => row.kind === 'item' && row.item.id === 'e2')).toMatchObject({ repairCostCents: null, openRepairs: 0, repairMarginCents: null })
  })

  it('shows the items the filter asks for, and a type only while it has one to show, except with every item shown', () => {
    expect(fleetRows(catalog, records, YEAR, 'in_repair').map((row) => row.path)).toEqual([['ebike'], ['ebike', 'e2']])
    expect(fleetRows(catalog, records, YEAR, 'retired').map((row) => row.path)).toEqual([['kayak'], ['kayak', 'k1']])
    expect(fleetRows({ types: [...catalog.types, type('empty', 'Tandem')], items: catalog.items }, records, YEAR, 'all').map((row) => row.path)).toContainEqual(['empty'])
  })
})
