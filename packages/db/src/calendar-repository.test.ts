import { money } from '@hold/domain'
import { beforeAll, describe, expect, it } from 'vitest'
import { registerOwner } from './accounts.ts'
import { shopCalendar } from './calendar-repository.ts'
import { publishPriceList } from './price-list-repository.ts'
import { addSampleRentals } from './sample-rentals.ts'
import { inShop } from './scope.ts'
import type { Scope } from './scope.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

// The shop's calendar (extensions.md section 12.5): each item a row, each rental a bar on the items it took, with where
// its PayPal hold stands. Read inside the shop alone.
const NOW = new Date('2026-10-14T09:12:00Z')
const WINDOW = { from: new Date('2026-10-10T00:00:00Z'), to: new Date('2026-10-24T00:00:00Z') }
let database: TestDatabase
let shop: Scope & { readonly userId: string }
let other: Scope & { readonly userId: string }

async function owner(subject: string, name: string) {
  const registered = await registerOwner(database, { subject, email: `${subject}@shop.example`, name, language: 'en', shop: { name, timeZone: 'Europe/Lisbon' } })
  return { role: 'hold_app' as const, shopId: registered.shopId, userId: registered.userId }
}

beforeAll(async () => {
  database = await createTestDatabase()
  shop = await owner('owner-calendar', 'Ribeira Bikes')
  other = await owner('owner-calendar-other', 'Douro Kayaks')
  await inShop(database, shop, (transaction) => publishPriceList(transaction, shop.shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries: [{ description: 'Scratch', category: 'damage', amount: money(35_00, 'EUR') }], wearPolicy: 'Scuffs are wear.' }, NOW))
  await inShop(database, shop, (transaction) => addSampleRentals(transaction, { shopId: shop.shopId, userId: shop.userId, timeZone: 'Europe/Lisbon', now: NOW }))
})

describe('the shop’s calendar', () => {
  it('lists every item as a row and every rental in the window as a bar on each item it took', async () => {
    const calendar = await inShop(database, shop, (transaction) => shopCalendar(transaction, WINDOW))
    expect(calendar.items.map((item) => item.label)).toContain('E-bike 1')
    const sofia = calendar.bookings.filter((booking) => booking.renterName === 'Sofia Marques')
    expect(sofia.map((booking) => calendar.items.find((item) => item.id === booking.itemId)?.label).sort()).toEqual(['E-bike 1', 'E-bike 2'])
    expect(sofia[0]).toMatchObject({ rentalState: 'out', holdState: 'placed', simulated: true })
  })

  it('shows where each rental’s hold stands, and a rental with no hold yet', async () => {
    const { bookings } = await inShop(database, shop, (transaction) => shopCalendar(transaction, WINDOW))
    expect(bookings.find((booking) => booking.renterName === 'Hannah Svensson')).toMatchObject({ rentalState: 'awaiting_hold', holdState: 'requested' })
    expect(bookings.find((booking) => booking.renterName === 'Lea Fischer')).toMatchObject({ rentalState: 'overdue' })
  })

  it('leaves out rentals outside the window, and anything of another shop', async () => {
    const early = await inShop(database, shop, (transaction) => shopCalendar(transaction, { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-01-08T00:00:00Z') }))
    expect(early.bookings).toEqual([])
    const elsewhere = await inShop(database, other, (transaction) => shopCalendar(transaction, WINDOW))
    expect(elsewhere).toEqual({ items: [], bookings: [] })
  })
})
