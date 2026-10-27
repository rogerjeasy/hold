import { eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { findPerson, registerOwner } from './accounts.ts'
import { DEMO_SHOP, resetDemoShop } from './demo-shop.ts'
import { auditLog, paypalAccounts, rentals, shops, staffRoles } from './schema/index.ts'
import { inShop } from './scope.ts'
import { savePayPalAccount } from './shop-repository.ts'
import { currentPriceList } from './price-list-repository.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

const NOW = new Date('2026-12-01T09:00:00Z')
const LATER = new Date('2026-12-02T09:00:00Z')
const OWNER = { subject: 'demo-owner-subject', email: 'tomas.demo@hold.example' }
const STAFF = { subject: 'demo-staff-subject', email: 'jonas.demo@hold.example' }

let database: TestDatabase

const rentalCount = async (shopId: string) => (await database.select({ count: sql<number>`count(*)::int` }).from(rentals).where(eq(rentals.shopId, shopId)))[0]?.count

beforeAll(async () => {
  database = await createTestDatabase()
})

describe('the demo shop', () => {
  it('starts with the owner, the counter staff, a published price list and the sample rentals', async () => {
    const reset = await resetDemoShop(database, { owner: OWNER, staff: STAFF, now: NOW })

    expect(reset).toMatchObject({ slug: 'ribeira-bikes', rentals: 11, archivedShopId: undefined, paypalMoved: false })
    const owner = await findPerson(database, OWNER.subject)
    const staff = await findPerson(database, STAFF.subject)
    expect(owner?.shops).toEqual([{ shopId: reset.shopId, name: DEMO_SHOP.name, role: 'owner' }])
    expect(staff?.shops).toEqual([{ shopId: reset.shopId, name: DEMO_SHOP.name, role: 'counter_staff' }])
    const [shop] = await database.select().from(shops).where(eq(shops.id, reset.shopId))
    expect(shop).toMatchObject({ timeZone: 'Europe/Lisbon', currency: 'EUR', ownerApprovalThresholdCents: DEMO_SHOP.ownerApprovalThresholdCents })
    const prices = await inShop(database, { role: 'hold_app', shopId: reset.shopId, userId: owner?.userId ?? '' }, (transaction) => currentPriceList(transaction))
    expect(prices?.entries.length).toBe(DEMO_SHOP.priceList.length)
  })

  it('archives the shop a judge used and starts a fresh one at the same address, deleting nothing', async () => {
    const first = await database.select({ id: shops.id }).from(shops).where(eq(shops.slug, 'ribeira-bikes'))
    const firstId = first[0]?.id ?? ''
    await inShop(database, { role: 'hold_app', shopId: firstId }, (transaction) => savePayPalAccount(transaction, firstId, 'sandbox', `hold/paypal/shops/${firstId}/sandbox`))
    const auditLines = (await database.select({ count: sql<number>`count(*)::int` }).from(auditLog).where(eq(auditLog.shopId, firstId)))[0]?.count

    const reset = await resetDemoShop(database, { owner: OWNER, staff: STAFF, now: LATER })

    expect(reset).toMatchObject({ slug: 'ribeira-bikes', rentals: 11, archivedShopId: firstId, paypalMoved: true })
    expect(reset.shopId).not.toBe(firstId)
    const [archived] = await database.select({ name: shops.name, slug: shops.slug }).from(shops).where(eq(shops.id, firstId))
    expect(archived).toEqual({ name: 'Ribeira Bikes (archived 2026-12-02 09:00 UTC)', slug: 'ribeira-bikes-archived-202612020900' })
    // The archived shop keeps every rental and every audit line, and nobody works in it any more.
    expect(await rentalCount(firstId)).toBe(11)
    expect((await database.select({ count: sql<number>`count(*)::int` }).from(auditLog).where(eq(auditLog.shopId, firstId)))[0]?.count).toBeGreaterThanOrEqual(auditLines ?? 0)
    expect(await database.select().from(staffRoles).where(eq(staffRoles.shopId, firstId))).toEqual([])
    // The PayPal connection, and with it the webhook address PayPal knows, now belongs to the new shop.
    expect(await database.select({ shopId: paypalAccounts.shopId }).from(paypalAccounts).where(eq(paypalAccounts.credentialReference, `hold/paypal/shops/${firstId}/sandbox`))).toEqual([
      { shopId: reset.shopId },
    ])
    expect((await findPerson(database, OWNER.subject))?.shops.map((shop) => shop.shopId)).toEqual([reset.shopId])
  })

  it('leaves every other shop alone', async () => {
    const other = await registerOwner(database, { subject: 'other-owner', email: 'ana@douro.example', name: 'Ana', language: 'en', shop: { name: 'Douro Kayaks', timeZone: 'Europe/Lisbon' } })
    await inShop(database, { role: 'hold_app', shopId: other.shopId }, (transaction) => savePayPalAccount(transaction, other.shopId, 'sandbox', 'hold/paypal/shops/other/sandbox'))

    await resetDemoShop(database, { owner: OWNER, staff: STAFF, now: new Date('2026-12-03T09:00:00Z') })

    const [shop] = await database.select({ name: shops.name, slug: shops.slug }).from(shops).where(eq(shops.id, other.shopId))
    expect(shop).toEqual({ name: 'Douro Kayaks', slug: 'douro-kayaks' })
    expect(await database.select({ shopId: paypalAccounts.shopId }).from(paypalAccounts).where(eq(paypalAccounts.credentialReference, 'hold/paypal/shops/other/sandbox'))).toEqual([
      { shopId: other.shopId },
    ])
    expect((await findPerson(database, 'other-owner'))?.shops).toEqual([{ shopId: other.shopId, name: 'Douro Kayaks', role: 'owner' }])
  })
})
