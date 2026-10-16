import { money } from '@hold/domain'
import { sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { registerOwner } from './accounts.ts'
import { createBooking } from './booking-repository.ts'
import { saveFeeOrder } from './fee-repository.ts'
import { addItems, saveItemType } from './item-repository.ts'
import { feeRentalByOrder, markOutboxSent, markPayPalEvent, payPalEvent, pendingOutbox, recordPayPalEvent } from './paypal-event-repository.ts'
import { publishPriceList } from './price-list-repository.ts'
import { findPayPalAccount, savePayPalAccount, saveWebhookId } from './shop-repository.ts'
import { inShop } from './scope.ts'
import type { Scope } from './scope.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

const NOW = new Date('2026-10-15T09:00:00Z')
const eur = (cents: number) => money(cents, 'EUR')

let database: TestDatabase
let owner: Scope
let shopId: string
let accountId: string
let worker: Scope

const delivery = (eventId: string, resourceId = 'ORDER-9') => ({
  eventId,
  type: 'CHECKOUT.ORDER.APPROVED',
  resourceId,
  rawBody: `{"id":"${eventId}","event_type":"CHECKOUT.ORDER.APPROVED","resource":{"id":"${resourceId}"}}`,
  headers: { 'paypal-transmission-id': 'T-1' },
})

beforeAll(async () => {
  database = await createTestDatabase()
  const registered = await registerOwner(database, { subject: 'owner', email: 'ana@ribeira.example', name: 'Ana', language: 'en', shop: { name: 'Ribeira Bikes', timeZone: 'UTC' } })
  shopId = registered.shopId
  owner = { role: 'hold_app', shopId, userId: registered.userId }
  worker = { role: 'hold_worker', shopId }
  await inShop(database, owner, (transaction) => savePayPalAccount(transaction, shopId, 'sandbox', 'hold/paypal/shops/a/sandbox'))
  const account = await inShop(database, owner, (transaction) => findPayPalAccount(transaction, shopId, 'sandbox'))
  accountId = account?.id ?? ''
})

describe('a shop’s webhook subscription', () => {
  it('is kept beside its PayPal account', async () => {
    await inShop(database, owner, (transaction) => saveWebhookId(transaction, shopId, 'sandbox', 'WEBHOOK-1'))
    expect(await inShop(database, owner, (transaction) => findPayPalAccount(transaction, shopId, 'sandbox'))).toMatchObject({ webhookId: 'WEBHOOK-1' })
  })
})

describe('an event PayPal delivers', () => {
  it('is stored with its exact body and an outbox message, once, however often PayPal sends it', async () => {
    const first = await recordPayPalEvent(database, accountId, delivery('WH-1'), NOW)
    expect(first).toMatchObject({ ok: true, stored: true, message: { shopId, group: 'ORDER-9' } })
    expect(await recordPayPalEvent(database, accountId, delivery('WH-1'), NOW)).toEqual({ ok: true, stored: false })
    const outbox = await pendingOutbox(database, 10)
    expect(outbox.filter((message) => message.queue === 'paypal-events')).toHaveLength(1)
    const [message] = outbox
    expect(message).toMatchObject({ shopId, queue: 'paypal-events', messageGroup: 'ORDER-9' })
    const event = await inShop(database, worker, (transaction) => payPalEvent(transaction, String(message?.payload['eventId'])))
    expect(event).toMatchObject({ paypalEventId: 'WH-1', type: 'CHECKOUT.ORDER.APPROVED', rawBody: delivery('WH-1').rawBody, verification: 'pending', processing: 'pending' })
  })

  it('is refused for an account Hold does not know', async () => {
    expect(await recordPayPalEvent(database, '00000000-0000-4000-8000-000000000000', delivery('WH-2'), NOW)).toEqual({ ok: false, reason: 'unknown_account' })
    expect(await recordPayPalEvent(database, 'not-an-id', delivery('WH-2'), NOW)).toEqual({ ok: false, reason: 'unknown_account' })
  })

  it('is marked once verified and applied', async () => {
    await recordPayPalEvent(database, accountId, delivery('WH-3'), NOW)
    const message = (await pendingOutbox(database, 10)).find((each) => each.payload['paypalEventId'] === 'WH-3')
    const eventId = String(message?.payload['eventId'])
    await inShop(database, worker, (transaction) => markPayPalEvent(transaction, eventId, { verification: 'verified', processing: 'applied', rentalId: null }))
    expect(await inShop(database, worker, (transaction) => payPalEvent(transaction, eventId))).toMatchObject({ verification: 'verified', processing: 'applied' })
  })
})

describe('the outbox', () => {
  it('is read across shops only by the worker, and a message sent is not read again', async () => {
    const before = await pendingOutbox(database, 50)
    expect(before.length).toBeGreaterThan(0)
    const [first] = before
    if (first === undefined) throw new Error('No message.')
    await inShop(database, { role: 'hold_worker', shopId: first.shopId }, (transaction) => markOutboxSent(transaction, first.id, NOW))
    expect((await pendingOutbox(database, 50)).map((message) => message.id)).not.toContain(first.id)
    // The web app cannot read another shop's messages through it.
    const asApp = database.transaction(async (transaction) => {
      await transaction.execute(sql`select set_config('role', 'hold_app', true)`)
      await transaction.execute(sql`select * from hold_pending_outbox(5)`)
    })
    expect(await asApp.then(() => 'not refused', (error: unknown) => (error instanceof Error && error.cause instanceof Error ? error.cause.message : String(error)))).toMatch(/permission denied/)
  })
})

describe('a fee order', () => {
  it('names the rental that started it', async () => {
    const type = await inShop(database, owner, async (transaction) => {
      await publishPriceList(transaction, shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries: [{ description: 'Scratch', category: 'damage', amount: eur(35_00) }], wearPolicy: 'Wear.' }, NOW)
      const saved = await saveItemType(transaction, shopId, { draft: { name: 'E-bike', category: 'e_bike', currency: 'EUR', value: eur(2400_00), hold: eur(300_00), dayRate: eur(40_00), accessories: [], views: [{ label: 'Frame', outline: 'whole_side', required: true }] } }, NOW)
      if (!saved.ok) throw new Error(saved.reason)
      await addItems(transaction, { itemTypeId: saved.id, count: 1, size: '', serial: '' }, NOW)
      return saved.id
    })
    const booked = await inShop(database, owner, (transaction) =>
      createBooking(transaction, shopId, { startsAt: new Date('2026-10-16T09:00:00Z'), endsAt: new Date('2026-10-17T09:00:00Z'), lines: [{ itemTypeId: type, count: 1 }], contact: undefined, language: 'en', bookedThrough: 'staff', link: { fingerprint: 'f-1', expiresAt: new Date('2027-01-01') } }, NOW),
    )
    if (!booked.ok) throw new Error(booked.reason)
    await inShop(database, worker, (transaction) => saveFeeOrder(transaction, booked.rentalId, 'ORDER-77'))
    expect(await inShop(database, worker, (transaction) => feeRentalByOrder(transaction, 'ORDER-77'))).toBe(booked.rentalId)
    expect(await inShop(database, worker, (transaction) => feeRentalByOrder(transaction, 'ORDER-unknown'))).toBeUndefined()
  })
})
