import type { CatalogItem, CatalogType, FleetItemRecord, ItemCatalog } from '@hold/db'
import { itemWear, wearingFastest } from '@hold/domain'
import type { DateWindow, ItemWear } from '@hold/domain'
import { shows } from './standing'
import type { ItemFilter } from './standing'

// The fleet passport's rows (extensions.md section 12.5): each item type with its items below it, as AG Grid's tree
// data holds them, each item with what its rentals say about it. The figures and the signal are the domain's.

export type FleetTypeRow = { readonly kind: 'type'; readonly id: string; readonly path: readonly string[]; readonly type: CatalogType }
export type FleetItemRow = {
  readonly kind: 'item'
  readonly id: string
  readonly path: readonly string[]
  readonly type: CatalogType
  readonly item: CatalogItem
  readonly wear: ItemWear
  readonly openMarks: number
  readonly fastest: boolean
}
export type FleetRow = FleetTypeRow | FleetItemRow

export function fleetRows(catalog: ItemCatalog, records: readonly FleetItemRecord[], window: DateWindow, show: ItemFilter): FleetRow[] {
  const recordOf = new Map(records.map((record) => [record.itemId, record]))
  const wearOf = new Map(catalog.items.map((item) => [item.id, itemWear(recordOf.get(item.id)?.rentals ?? [], window)]))
  // Retired items are no longer rented, so they are not compared with the items still in service.
  const fastest = wearingFastest(catalog.items.filter((item) => item.standing !== 'retired').map((item) => ({ itemId: item.id, typeId: item.itemTypeId, rentals: wearOf.get(item.id)?.rentals ?? 0, damageFindings: wearOf.get(item.id)?.damageFindings ?? 0 })))
  // A shop's own types first, the samples after them, as on the rest of the items page.
  const types = [...catalog.types].sort((a, b) => Number(a.simulated) - Number(b.simulated))
  return types.flatMap((type): FleetRow[] => {
    const items = catalog.items.filter((item) => item.itemTypeId === type.id && shows(show, item.standing))
    if (show !== 'all' && items.length === 0) return []
    return [
      { kind: 'type', id: type.id, path: [type.id], type },
      ...items.map((item): FleetItemRow => ({
        kind: 'item',
        id: item.id,
        path: [type.id, item.id],
        type,
        item,
        wear: wearOf.get(item.id) ?? itemWear([], window),
        openMarks: recordOf.get(item.id)?.openMarks ?? 0,
        fastest: fastest.has(item.id),
      })),
    ]
  })
}
