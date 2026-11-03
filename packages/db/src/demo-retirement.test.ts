import { and, eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { findPerson, registerOwner } from './accounts.ts'
import { publicShops } from './assistant-repository.ts'
import { demoSessionLive, demoSessionsDue, retireDemoSession } from './demo-retirement.ts'
import { openDemoSession } from './demo-session.ts'
import { shopsForOperations } from './ops-repository.ts'
import { auditLog, rentals, shops, staffRoles } from './schema/index.ts'
import { inShop } from './scope.ts'
import { savePayPalAccount, shopBySlug } from './shop-repository.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

// A demo is retired a week after it opened (architecture.md section 20.3): marked, never deleted, and gone from every
// place a live demo shows. A shop that is not a demo, or a demo still in its week, is never touched.
const OPENED = new Date('2026-12-01T09:00:00Z')
const CUTOFF = new Date('2026-12-02T00:00:00Z')
const NOW = new Date('2026-12-09T03:00:00Z')
const PAYPAL = { credentialReference: 'hold/paypal/shops/demo/sandbox', mode: 'sandbox' as const }

let database: TestDatabase
beforeAll(async () => {
  database = await createTestDatabase()
})

async function demo(code: string, openedAt: Date) {
  const opened = await openDemoSession(database, {
    owner: { subject: `owner-${code}`, email: `tomas.${code}@demo.hold.example` },
    staff: { subject: `staff-${code}`, email: `jonas.${code}@demo.hold.example` },
    slug: `ribeira-bikes-${code}`,
    paypal: PAYPAL,
    now: openedAt,
  })
  // The shop's own clock is the database's; the test sets when it opened through the table owner.
  await database.update(shops).set({ createdAt: openedAt }).where(eq(shops.id, opened.shopId))
  return opened
}

const count = async (table: typeof rentals | typeof staffRoles | typeof auditLog, shopId: string) =>
  (await database.select({ count: sql<number>`count(*)::int` }).from(table).where(eq(table.shopId, shopId)))[0]?.count ?? 0

describe('finding the demos due to retire', () => {
  it('lists each demo opened before the cutoff with the addresses of its two people, and nothing else', async () => {
    const old = await demo('old1', OPENED)
    const young = await demo('young1', new Date('2026-12-05T09:00:00Z'))
    const shop = await registerOwner(database, { subject: 'real-owner-1', email: 'ana@douro.example', name: 'Ana', language: 'en', shop: { name: 'Douro Kayaks', timeZone: 'Europe/Lisbon' } })
    await database.update(shops).set({ createdAt: OPENED }).where(eq(shops.id, shop.shopId))

    const due = await demoSessionsDue(database, CUTOFF)

    expect(due).toContainEqual({ shopId: old.shopId, emails: ['jonas.old1@demo.hold.example', 'tomas.old1@demo.hold.example'] })
    expect(due.map((each) => each.shopId)).not.toContain(young.shopId)
    expect(due.map((each) => each.shopId)).not.toContain(shop.shopId)
  })
})

describe('retiring a demo', () => {
  it('marks the shop retired with an audit line, and deletes nothing', async () => {
    const old = await demo('old2', OPENED)
    const before = { rentals: await count(rentals, old.shopId), roles: await count(staffRoles, old.shopId), audit: await count(auditLog, old.shopId) }

    expect(await retireDemoSession(database, { shopId: old.shopId, cutoff: CUTOFF, now: NOW })).toBe(true)

    const [shop] = await database.select({ retiredAt: shops.retiredAt, name: shops.name, slug: shops.slug }).from(shops).where(eq(shops.id, old.shopId))
    expect(shop).toEqual({ retiredAt: NOW, name: 'Ribeira Bikes', slug: 'ribeira-bikes-old2' })
    expect(await count(rentals, old.shopId)).toBe(before.rentals)
    expect(await count(staffRoles, old.shopId)).toBe(before.roles)
    expect(await count(auditLog, old.shopId)).toBe(before.audit + 1)
    expect(await database.select({ detail: auditLog.detail }).from(auditLog).where(and(eq(auditLog.shopId, old.shopId), eq(auditLog.action, 'demo.retired')))).toEqual([{ detail: { simulated: true } }])
    expect((await demoSessionsDue(database, CUTOFF)).map((each) => each.shopId)).not.toContain(old.shopId)
  })

  it('retires a demo once: a second run changes nothing', async () => {
    const old = await demo('old3', OPENED)
    await retireDemoSession(database, { shopId: old.shopId, cutoff: CUTOFF, now: NOW })

    expect(await retireDemoSession(database, { shopId: old.shopId, cutoff: CUTOFF, now: new Date('2026-12-10T03:00:00Z') })).toBe(false)
    const [shop] = await database.select({ retiredAt: shops.retiredAt }).from(shops).where(eq(shops.id, old.shopId))
    expect(shop?.retiredAt).toEqual(NOW)
  })

  it('never touches a shop that is not a demo, however old', async () => {
    const shop = await registerOwner(database, { subject: 'real-owner-2', email: 'rui@douro.example', name: 'Rui', language: 'en', shop: { name: 'Douro Bikes', timeZone: 'Europe/Lisbon' } })
    await database.update(shops).set({ createdAt: OPENED }).where(eq(shops.id, shop.shopId))
    const audit = await count(auditLog, shop.shopId)

    expect(await retireDemoSession(database, { shopId: shop.shopId, cutoff: CUTOFF, now: NOW })).toBe(false)

    const [row] = await database.select({ retiredAt: shops.retiredAt }).from(shops).where(eq(shops.id, shop.shopId))
    expect(row?.retiredAt).toBeNull()
    expect(await count(auditLog, shop.shopId)).toBe(audit)
    expect((await findPerson(database, 'real-owner-2'))?.shops.map((each) => each.shopId)).toEqual([shop.shopId])
  })

  it('never touches a demo still in its week', async () => {
    const young = await demo('young2', new Date('2026-12-05T09:00:00Z'))

    expect(await retireDemoSession(database, { shopId: young.shopId, cutoff: CUTOFF, now: NOW })).toBe(false)
    expect(await demoSessionLive(database, young.shopId)).toBe(true)
  })

  it('cannot mark a shop that is not a demo retired, even by hand', async () => {
    const shop = await registerOwner(database, { subject: 'real-owner-3', email: 'eva@douro.example', name: 'Eva', language: 'en', shop: { name: 'Douro Boats', timeZone: 'Europe/Lisbon' } })

    await expect(database.update(shops).set({ retiredAt: NOW }).where(eq(shops.id, shop.shopId))).rejects.toThrow()
  })
})

describe('a retired demo', () => {
  it('is hidden everywhere a live demo shows: its people’s shops, its address, the nightly runs and the demo check', async () => {
    const old = await demo('old4', OPENED)
    expect(await demoSessionLive(database, old.shopId)).toBe(true)
    expect(await shopsForOperations(database, 'sandbox')).toContain(old.shopId)

    await retireDemoSession(database, { shopId: old.shopId, cutoff: CUTOFF, now: NOW })

    expect(await demoSessionLive(database, old.shopId)).toBe(false)
    expect((await findPerson(database, 'owner-old4'))?.shops).toEqual([])
    expect((await findPerson(database, 'staff-old4'))?.shops).toEqual([])
    expect(await shopBySlug(database, 'ribeira-bikes-old4')).toBeUndefined()
    expect(await shopsForOperations(database, 'sandbox')).not.toContain(old.shopId)
    expect((await publicShops(database, { place: null, kind: null, paypalMode: 'sandbox' })).map((shop) => shop.id)).not.toContain(old.shopId)
  })

  it('leaves every live shop where it was', async () => {
    const live = await registerOwner(database, { subject: 'real-owner-4', email: 'ines@douro.example', name: 'Inês', language: 'en', shop: { name: 'Douro Surf', timeZone: 'Europe/Lisbon' } })
    await inShop(database, { role: 'hold_app', shopId: live.shopId }, (transaction) => savePayPalAccount(transaction, live.shopId, 'sandbox', 'hold/paypal/shops/surf/sandbox'))
    const old = await demo('old5', OPENED)

    await retireDemoSession(database, { shopId: old.shopId, cutoff: CUTOFF, now: NOW })

    expect((await findPerson(database, 'real-owner-4'))?.shops.map((shop) => shop.shopId)).toEqual([live.shopId])
    expect(await shopBySlug(database, 'douro-surf')).toMatchObject({ id: live.shopId })
    expect(await shopsForOperations(database, 'sandbox')).toContain(live.shopId)
  })

  it('is not a live demo when the shop is not a demo or does not exist', async () => {
    const shop = await registerOwner(database, { subject: 'real-owner-5', email: 'joao@douro.example', name: 'João', language: 'en', shop: { name: 'Douro Cycles', timeZone: 'Europe/Lisbon' } })

    expect(await demoSessionLive(database, shop.shopId)).toBe(false)
    expect(await demoSessionLive(database, '00000000-0000-4000-8000-000000000000')).toBe(false)
  })
})
