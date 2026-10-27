import { money } from '@hold/domain'
import { and, eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { findPerson } from './accounts.ts'
import { publicShops } from './assistant-repository.ts'
import { openDemoSession } from './demo-session.ts'
import { DEMO_SHOP } from './demo-shop.ts'
import { addItems, saveItemType } from './item-repository.ts'
import { auditLog, paypalAccounts, rentals, shops } from './schema/index.ts'
import { inShop } from './scope.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

// Each judge who starts a demo gets a shop of their own, with accounts of their own (architecture.md section 20.3).
// Nobody else's demo is reachable from it, and none of them is listed for renters' assistants.
const NOW = new Date('2026-12-01T09:00:00Z')
const PAYPAL = { credentialReference: 'hold/paypal/shops/demo/sandbox', mode: 'sandbox' as const }

let database: TestDatabase
beforeAll(async () => {
  database = await createTestDatabase()
})

const people = (session: string) => ({
  owner: { subject: `owner-${session}`, email: `tomas.${session}@demo.hold.example` },
  staff: { subject: `staff-${session}`, email: `jonas.${session}@demo.hold.example` },
})

describe('a demo session', () => {
  it('opens a busy shop of its own at an address nobody can guess, with the owner, the counter staff and the shared sandbox connection', async () => {
    const opened = await openDemoSession(database, { ...people('k3v9q2'), slug: 'ribeira-bikes-k3v9q2', paypal: PAYPAL, now: NOW })

    expect(opened).toMatchObject({ slug: 'ribeira-bikes-k3v9q2', rentals: 11 })
    expect((await findPerson(database, 'owner-k3v9q2'))?.shops).toEqual([{ shopId: opened.shopId, name: DEMO_SHOP.name, role: 'owner' }])
    expect((await findPerson(database, 'staff-k3v9q2'))?.shops).toEqual([{ shopId: opened.shopId, name: DEMO_SHOP.name, role: 'counter_staff' }])
    const [shop] = await database.select().from(shops).where(eq(shops.id, opened.shopId))
    expect(shop).toMatchObject({ name: DEMO_SHOP.name, demoSession: true, currency: 'EUR' })
    expect(await database.select({ credentialReference: paypalAccounts.credentialReference, mode: paypalAccounts.mode, webhookId: paypalAccounts.webhookId }).from(paypalAccounts).where(eq(paypalAccounts.shopId, opened.shopId))).toEqual([
      { ...PAYPAL, webhookId: null },
    ])
    const started = await database.select().from(auditLog).where(and(eq(auditLog.shopId, opened.shopId), eq(auditLog.action, 'demo.session_started')))
    expect(started).toHaveLength(1)
  })

  it('opens without a PayPal connection when the demo has none', async () => {
    const opened = await openDemoSession(database, { ...people('n0pay1'), slug: 'ribeira-bikes-n0pay1', paypal: undefined, now: NOW })

    expect(await database.select().from(paypalAccounts).where(eq(paypalAccounts.shopId, opened.shopId))).toEqual([])
  })

  it('never shares a shop with another session: each session’s people have a role in their own shop alone', async () => {
    const first = await openDemoSession(database, { ...people('first1'), slug: 'ribeira-bikes-first1', paypal: PAYPAL, now: NOW })
    const second = await openDemoSession(database, { ...people('second'), slug: 'ribeira-bikes-second', paypal: PAYPAL, now: NOW })

    expect(second.shopId).not.toBe(first.shopId)
    expect((await findPerson(database, 'owner-second'))?.shops.map((shop) => shop.shopId)).toEqual([second.shopId])
    // Row-level security: acting in the second shop reads none of the first shop's rentals.
    const owner = await findPerson(database, 'owner-second')
    const seen = await inShop(database, { role: 'hold_app', shopId: second.shopId, userId: owner?.userId ?? '' }, (transaction) =>
      transaction.select({ count: sql<number>`count(*)::int` }).from(rentals).where(eq(rentals.shopId, first.shopId)),
    )
    expect(seen[0]?.count).toBe(0)
  })

  it('is never listed for renters’ assistants, even with a bike in service and PayPal connected', async () => {
    const opened = await openDemoSession(database, { ...people('listed'), slug: 'ribeira-bikes-listed', paypal: PAYPAL, now: NOW })
    const owner = await findPerson(database, 'owner-listed')
    const scope = { role: 'hold_app' as const, shopId: opened.shopId, userId: owner?.userId ?? '' }
    const eur = (cents: number) => money(cents, 'EUR')
    const saved = await inShop(database, scope, (transaction) =>
      saveItemType(transaction, opened.shopId, { draft: { name: 'City e-bike', category: 'e_bike', currency: 'EUR', value: eur(2400_00), hold: eur(300_00), dayRate: eur(40_00), accessories: [], views: [{ label: 'Frame', outline: 'whole_side', required: true }] } }, NOW),
    )
    if (!saved.ok) throw new Error(saved.reason)
    await inShop(database, scope, (transaction) => addItems(transaction, { itemTypeId: saved.id, count: 1, size: '', serial: '' }, NOW))

    const listed = await publicShops(database, { place: 'ribeira', kind: null, paypalMode: 'sandbox' })
    expect(listed.map((shop) => shop.id)).not.toContain(opened.shopId)
    // The same shop, were it not a demo session, would be listed: the flag alone keeps it out.
    await database.update(shops).set({ demoSession: false }).where(eq(shops.id, opened.shopId))
    expect((await publicShops(database, { place: 'ribeira', kind: null, paypalMode: 'sandbox' })).map((shop) => shop.id)).toContain(opened.shopId)
  })
})
