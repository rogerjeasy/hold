import type { CatalogItem, CatalogType, ItemCatalog } from '@hold/db'

// A small shop's catalog for the screen tests: one type with an item in each standing, and one sample type.

export const ebikeType: CatalogType = {
  id: '00000000-0000-4000-8000-0000000000e1',
  name: 'City e-bike',
  category: 'e_bike',
  currency: 'EUR',
  valueCents: 2400_00,
  holdCents: 300_00,
  dayRateCents: 45_00,
  accessories: [
    { name: 'Charger', count: 1 },
    { name: 'Lock', count: 2 },
  ],
  photoPlanId: '00000000-0000-4000-8000-0000000000p1',
  views: [
    { key: 'frame-left', label: 'Frame, left side', outline: 'whole_side', required: true },
    { key: 'display', label: 'Display', outline: 'detail', required: false },
  ],
  simulated: false,
}

export const sampleType: CatalogType = { ...ebikeType, id: '00000000-0000-4000-8000-0000000000s1', name: 'Tandem kayak', category: 'water', accessories: [], simulated: true }

const item = (id: string, label: string, overrides: Partial<CatalogItem>): CatalogItem => ({
  id: `00000000-0000-4000-8000-00000000000${id}`,
  itemTypeId: ebikeType.id,
  label,
  size: null,
  serial: null,
  status: 'in_service',
  statusNote: null,
  statusSince: null,
  standing: 'available',
  rental: undefined,
  simulated: false,
  ...overrides,
})

export const items = {
  available: item('1', 'City e-bike 1', { size: 'M', serial: 'WTU-0042' }),
  out: item('2', 'City e-bike 2', {
    standing: 'out',
    rental: { id: 'r1', state: 'out', startsAt: new Date('2026-10-14T08:00:00Z'), endsAt: new Date('2026-10-16T16:00:00Z') },
  }),
  overdue: item('3', 'City e-bike 3', {
    standing: 'overdue',
    rental: { id: 'r2', state: 'overdue', startsAt: new Date('2026-10-10T08:00:00Z'), endsAt: new Date('2026-10-14T16:00:00Z') },
  }),
  repair: item('4', 'City e-bike 4', { status: 'in_repair', standing: 'in_repair', statusNote: 'Brake pads', statusSince: new Date('2026-10-13T09:00:00Z') }),
  retired: item('5', 'City e-bike 5', { status: 'retired', standing: 'retired' }),
  sample: item('6', 'Tandem kayak 1', { itemTypeId: sampleType.id, simulated: true }),
}

export const catalog: ItemCatalog = { types: [ebikeType, sampleType], items: Object.values(items) }
