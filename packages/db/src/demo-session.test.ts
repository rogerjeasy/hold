import { mayConfirm, money } from '@hold/domain'
import { and, eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { findPerson } from './accounts.ts'
import { publicShops } from './assistant-repository.ts'
import { demoAccountForRental, openDemoSession } from './demo-session.ts'
import { DEMO_SHOP } from './demo-shop.ts'
import { addItems, saveItemType } from './item-repository.ts'
import { bookableTypes } from './booking-repository.ts'
import { auditLog, claims, itemTypes, paypalAccounts, photoPlans, rentals, shops } from './schema/index.ts'
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

  it('raises its sample claims at the counter, as Jonas, so the owner can decide the contested one', async () => {
    const opened = await openDemoSession(database, { ...people('claim1'), slug: 'ribeira-bikes-claim1', paypal: PAYPAL, now: NOW })
    const owner = await findPerson(database, 'owner-claim1')
    const staff = await findPerson(database, 'staff-claim1')
    const raised = await database.select({ state: claims.state, raisedBy: claims.raisedByUserId }).from(claims).where(eq(claims.shopId, opened.shopId))
    expect(raised.length).toBeGreaterThan(0)
    expect(raised.every((claim) => claim.raisedBy === staff?.userId)).toBe(true)
    const contested = raised.find((claim) => claim.state === 'contested')
    expect(mayConfirm({ staffId: owner?.userId ?? '', role: 'owner', approvalLimit: money(0, 'EUR') }, { kind: 'decide_contested_claim', raisedBy: contested?.raisedBy ?? '', shopStaffCount: 2 }).ok).toBe(true)
  })

  it('offers real bikes a judge can book at the counter, on the shop page or through an assistant, beside the samples', async () => {
    const opened = await openDemoSession(database, { ...people('book01'), slug: 'ribeira-bikes-book01', paypal: PAYPAL, now: NOW })
    const owner = await findPerson(database, 'owner-book01')
    const scope = { role: 'hold_app' as const, shopId: opened.shopId, userId: owner?.userId ?? '' }
    const tomorrow = { startsAt: new Date('2026-12-02T09:00:00Z'), endsAt: new Date('2026-12-05T09:00:00Z') }

    const bookable = await inShop(database, scope, (transaction) => bookableTypes(transaction, tomorrow, NOW))

    expect(bookable).toEqual([expect.objectContaining({ name: DEMO_SHOP.bookable.name, currency: 'EUR', available: DEMO_SHOP.bookable.count })])
    const [type] = await database.select({ simulated: itemTypes.simulated, views: photoPlans.views }).from(itemTypes).innerJoin(photoPlans, eq(photoPlans.id, itemTypes.photoPlanId)).where(and(eq(itemTypes.shopId, opened.shopId), eq(itemTypes.name, DEMO_SHOP.bookable.name)))
    expect(type?.simulated).toBe(false)
    // One photograph a side of the frame is all a judge must take; the sample photograph is of that view.
    expect(type?.views.filter((view: { readonly required: boolean }) => view.required)).toHaveLength(1)
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

// The demo's one sandbox app has one webhook address for every demo shop (architecture.md section 20.3). An event is
// routed to the demo shop whose rental Hold named in the order's custom_id, and to no other shop.
describe('events of the demo’s shared PayPal app', () => {
  it('are verified against the shared webhook, which every demo shop keeps', async () => {
    const opened = await openDemoSession(database, { ...people('hook01'), slug: 'ribeira-bikes-hook01', paypal: { ...PAYPAL, webhookId: 'WH-SHARED' }, now: NOW })
    const [account] = await database.select({ webhookId: paypalAccounts.webhookId }).from(paypalAccounts).where(eq(paypalAccounts.shopId, opened.shopId))
    expect(account?.webhookId).toBe('WH-SHARED')
  })

  it('reach the demo shop whose rental the order names, and never a shop that is not a demo', async () => {
    const opened = await openDemoSession(database, { ...people('route1'), slug: 'ribeira-bikes-route1', paypal: { ...PAYPAL, webhookId: 'WH-SHARED' }, now: NOW })
    const [rental] = await inShop(database, { role: 'hold_app', shopId: opened.shopId }, (transaction) => transaction.select({ id: rentals.id }).from(rentals).limit(1))
    const [account] = await database.select({ id: paypalAccounts.id }).from(paypalAccounts).where(eq(paypalAccounts.shopId, opened.shopId))

    expect(await demoAccountForRental(database, rental?.id ?? '', 'sandbox')).toBe(account?.id)
    expect(await demoAccountForRental(database, rental?.id ?? '', 'live')).toBeUndefined()
    expect(await demoAccountForRental(database, 'not-a-rental', 'sandbox')).toBeUndefined()
    await database.update(shops).set({ demoSession: false }).where(eq(shops.id, opened.shopId))
    expect(await demoAccountForRental(database, rental?.id ?? '', 'sandbox')).toBeUndefined()
  })
})
