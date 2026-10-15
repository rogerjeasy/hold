import type { ItemStanding } from '@hold/domain'

// The filters on the items page, and the standings each one shows. Retired items show only when asked for.
export const ITEM_FILTERS = ['all', 'available', 'booked', 'out', 'in_repair', 'retired'] as const
export type ItemFilter = (typeof ITEM_FILTERS)[number]

const SHOWN: Readonly<Record<ItemFilter, readonly ItemStanding[]>> = {
  all: ['available', 'booked', 'out', 'overdue', 'checking', 'in_repair'],
  available: ['available'],
  booked: ['booked'],
  out: ['out', 'overdue', 'checking'],
  in_repair: ['in_repair'],
  retired: ['retired'],
}

export function shows(filter: ItemFilter, standing: ItemStanding): boolean {
  return SHOWN[filter].includes(standing)
}

export function readFilter(value: unknown): ItemFilter {
  return ITEM_FILTERS.find((filter) => filter === value) ?? 'all'
}
