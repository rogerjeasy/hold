import { money } from '@hold/domain'
import { beforeAll, describe, expect, it } from 'vitest'
import { registerOwner } from './accounts.ts'
import { priceListVersions, publishPriceList } from './price-list-repository.ts'
import { addSampleRentals } from './sample-rentals.ts'
import { inShop } from './scope.ts'
import type { Scope } from './scope.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

// Every version of a shop's terms, newest first, with how many rentals still open were agreed to it: a renter agreed
// to one version at booking, and is held to that one alone.
const NOW = new Date('2026-10-14T09:12:00Z')
let database: TestDatabase
let shop: Scope & { readonly userId: string }
let other: Scope & { readonly userId: string }

async function owner(subject: string, name: string) {
  const registered = await registerOwner(database, { subject, email: `${subject}@shop.example`, name, language: 'en', shop: { name, timeZone: 'Europe/Lisbon' } })
  return { role: 'hold_app' as const, shopId: registered.shopId, userId: registered.userId }
}
const list = (amount: number, wearPolicy: string) => ({
  currency: 'EUR', ownerApprovalThreshold: undefined, wearPolicy,
  entries: [{ description: 'Deep scratch on the frame', category: 'damage' as const, amount: money(amount, 'EUR') }, { description: 'Lost lock', category: 'loss' as const, amount: money(45_00, 'EUR') }],
})

beforeAll(async () => {
  database = await createTestDatabase()
  shop = await owner('owner-versions', 'Ribeira Bikes')
  other = await owner('owner-versions-other', 'Douro Kayaks')
  await inShop(database, shop, (transaction) => publishPriceList(transaction, shop.shopId, list(35_00, 'Scuffs are wear.'), NOW))
  await inShop(database, shop, (transaction) => addSampleRentals(transaction, { shopId: shop.shopId, userId: shop.userId, timeZone: 'Europe/Lisbon', now: NOW }))
  await inShop(database, shop, (transaction) => publishPriceList(transaction, shop.shopId, list(40_00, 'Scuffs and dust are wear.'), new Date('2026-10-15T09:00:00Z')))
})

describe('the versions of a shop’s terms', () => {
  it('lists each published version newest first, with its entries, its wear policy and the open rentals agreed to it', async () => {
    const versions = await inShop(database, shop, (transaction) => priceListVersions(transaction))
    expect(versions.map((each) => [each.version, each.liveRentals])).toEqual([[2, 0], [1, 10]])
    expect(versions[0]).toMatchObject({ currency: 'EUR', wearPolicy: 'Scuffs and dust are wear.' })
    expect(versions[0]?.entries).toEqual([
      { description: 'Deep scratch on the frame', category: 'damage', amountCents: 40_00 },
      { description: 'Lost lock', category: 'loss', amountCents: 45_00 },
    ])
  })

  it('shows another shop nothing', async () => {
    expect(await inShop(database, other, (transaction) => priceListVersions(transaction))).toEqual([])
  })
})
