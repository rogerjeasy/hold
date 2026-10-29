import { money } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { registerOwner } from './accounts.ts'
import { fleetRecords } from './fleet-records.ts'
import { publishPriceList } from './price-list-repository.ts'
import { addSampleRentals } from './sample-rentals.ts'
import { rentalItems, rentals, renters } from './schema/index.ts'
import { inShop } from './scope.ts'
import type { Scope } from './scope.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

// What the fleet passport reads (extensions.md section 12.5): every item's rentals that went out, the damage the
// comparison found on it at each return, the claim lines priced from that damage, what PayPal collected on each claim,
// and the marks still open on it, read inside the shop alone.

const NOW = new Date('2026-10-14T09:12:00Z')
const TIME_ZONE = 'Europe/Lisbon'
let database: TestDatabase
let shop: Scope
let other: Scope

async function owner(subject: string, name: string): Promise<Scope> {
  const registered = await registerOwner(database, { subject, email: `${subject}@shop.example`, name, language: 'en', shop: { name, timeZone: TIME_ZONE } })
  return { role: 'hold_app', shopId: registered.shopId, userId: registered.userId }
}

const read = (scope: Scope) => inShop(database, scope, (transaction) => fleetRecords(transaction))

async function itemRentedBy(renterName: string) {
  const [row] = await inShop(database, shop, (transaction) =>
    transaction.select({ itemId: rentalItems.itemId }).from(rentalItems).innerJoin(rentals, eq(rentals.id, rentalItems.rentalId)).innerJoin(renters, eq(renters.id, rentals.renterId)).where(eq(renters.name, renterName)))
  if (row === undefined) throw new Error(`No item rented by ${renterName}.`)
  return row.itemId
}

beforeAll(async () => {
  database = await createTestDatabase()
  shop = await owner('owner-fleet', 'Ribeira Bikes')
  other = await owner('owner-fleet-other', 'Douro Kayaks')
  const priceList = {
    currency: 'EUR',
    ownerApprovalThreshold: undefined,
    entries: [
      { description: 'Deep scratch on the frame', category: 'damage' as const, amount: money(35_00, 'EUR') },
      { description: 'Lost lock', category: 'loss' as const, amount: money(45_00, 'EUR') },
    ],
    wearPolicy: 'Light scuffs are ordinary wear.',
  }
  await inShop(database, shop, (transaction) => publishPriceList(transaction, shop.shopId, priceList, NOW))
  await inShop(database, shop, (transaction) => addSampleRentals(transaction, { shopId: shop.shopId, userId: shop.userId ?? '', timeZone: TIME_ZONE, now: NOW }))
})

describe('the records the fleet passport reads', () => {
  it('gives an item rented alone every line of its rental’s decided claim, even one a person wrote, and what PayPal collected', async () => {
    const itemId = await itemRentedBy('Daniel Ortiz')
    const item = (await read(shop)).find((each) => each.itemId === itemId)
    expect(item?.rentals).toHaveLength(1)
    expect(item?.rentals[0]).toMatchObject({ damageFindings: 0, claimLinesCents: 35_00, claimTotalCents: 35_00, collectedCents: 35_00 })
  })

  it('counts damage found on a claim nobody has decided yet, but prices none of it', async () => {
    const itemId = await itemRentedBy('Priya Natarajan')
    const item = (await read(shop)).find((each) => each.itemId === itemId)
    expect(item?.rentals[0]).toMatchObject({ damageFindings: 1, claimLinesCents: 0, collectedCents: 0 })
  })

  it('counts only rentals that went out, so a booking still to come is no rental yet', async () => {
    const records = await read(shop)
    const itemId = await itemRentedBy('Hannah Svensson')
    expect(records.find((each) => each.itemId === itemId)?.rentals ?? []).toHaveLength(0)
  })

  it('lists every item of the shop once, and another shop’s none', async () => {
    const records = await read(shop)
    expect(new Set(records.map((each) => each.itemId)).size).toBe(records.length)
    expect(records.length).toBeGreaterThan(0)
    expect(await read(other)).toEqual([])
  })
})
