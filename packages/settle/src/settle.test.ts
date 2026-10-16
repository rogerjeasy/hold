import { createBooking, findPayPalAccount, inShop, moneyEvents, outbox, paypalEvents, publishPriceList, recordPayPalEvent, registerOwner, rentalDetail, saveFeeOrder, savePayPalAccount, saveWebhookId } from '@hold/db'
import { addItems, saveItemType } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import type { TestDatabase } from '@hold/db/testing'
import { fail, money } from '@hold/domain'
import { createFakePayPal, FAKE_SIGNATURE } from '@hold/paypal'
import type { FakePayPal, PayPalHolds } from '@hold/paypal'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applyPayPalEvent, relayOutbox, requestFeeCapture, runExecution } from './index.ts'
import type { QueueMessage, SettleDependencies } from './index.ts'

const eur = (cents: number) => money(cents, 'EUR')

let database: TestDatabase
let fake: FakePayPal
let shopId: string
let accountId: string
let webhookId: string
let typeId: string
let sent: QueueMessage[]
let paypal: PayPalHolds
let day = 0

const dependencies = (): SettleDependencies => ({
  database,
  paypalFor: () => paypal,
  paypalMode: 'sandbox',
  send: (message) => {
    sent.push(message)
    return Promise.resolve()
  },
  now: () => new Date(),
})

// A booking waiting for its fee, with a fee order in PayPal for it, on days of its own.
async function waitingRental(approved: boolean): Promise<{ rentalId: string; orderId: string }> {
  day += 2
  const startsAt = new Date(Date.now() + day * 86_400_000)
  const booked = await inShop(database, { role: 'hold_app', shopId }, (transaction) =>
    createBooking(
      transaction,
      shopId,
      { startsAt, endsAt: new Date(startsAt.getTime() + 86_400_000), lines: [{ itemTypeId: typeId, count: 1 }], contact: undefined, language: 'en', bookedThrough: 'shop_page', link: { fingerprint: `link-${String(day)}`, expiresAt: new Date('2027-06-01') } },
      new Date(),
    ),
  )
  if (!booked.ok) throw new Error(booked.reason)
  const order = await fake.createFeeOrder({ amount: eur(40_00), rentalReference: booked.rentalId, description: 'Fee', returnUrl: 'https://hold.test/paid', cancelUrl: 'https://hold.test/r', idempotencyKey: `fee-order-${booked.rentalId}` })
  if (!order.ok) throw new Error(order.error.kind)
  await inShop(database, { role: 'hold_app', shopId }, (transaction) => saveFeeOrder(transaction, booked.rentalId, order.value.orderId))
  if (approved) fake.approveOrder(order.value.orderId)
  return { rentalId: booked.rentalId, orderId: order.value.orderId }
}

const stateOf = async (rentalId: string) => (await inShop(database, { role: 'hold_app', shopId }, (transaction) => rentalDetail(transaction, rentalId, new Date())))?.state
const feesFor = async (rentalId: string) => (await database.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId))).length

// An event as PayPal would deliver it to the shop's address, stored first as the intake stores it.
async function delivered(type: string, resource: Record<string, unknown>, signature = FAKE_SIGNATURE): Promise<string> {
  const paypalEventId = `WH-${String(Math.random()).slice(2, 12)}`
  const body = JSON.stringify({ id: paypalEventId, event_type: type, resource })
  const headers = { 'paypal-transmission-id': paypalEventId, 'paypal-transmission-time': '2026-10-15T09:00:00Z', 'paypal-transmission-sig': signature, 'paypal-cert-url': 'fake', 'paypal-auth-algo': 'fake' }
  const recorded = await recordPayPalEvent(database, accountId, { eventId: paypalEventId, type, resourceId: String(resource['id']), rawBody: body, headers }, new Date())
  if (!recorded.ok) throw new Error(recorded.reason)
  const [event] = await database.select({ id: paypalEvents.id }).from(paypalEvents).where(eq(paypalEvents.paypalEventId, paypalEventId))
  return event?.id ?? ''
}

beforeAll(async () => {
  database = await createTestDatabase()
  fake = createFakePayPal({ now: () => new Date() })
  const registered = await registerOwner(database, { subject: 'owner', email: 'ana@ribeira.example', name: 'Ana', language: 'en', shop: { name: 'Ribeira Bikes', timeZone: 'UTC' } })
  shopId = registered.shopId
  const owner = { role: 'hold_app', shopId, userId: registered.userId } as const
  const webhook = await fake.createWebhook({ url: 'https://hold.test/api/webhooks/paypal/a', eventTypes: [] })
  webhookId = webhook.ok ? webhook.value.webhookId : ''
  typeId = await inShop(database, owner, async (transaction) => {
    await publishPriceList(transaction, shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries: [{ description: 'Scratch', category: 'damage', amount: eur(35_00) }], wearPolicy: 'Wear.' }, new Date())
    await savePayPalAccount(transaction, shopId, 'sandbox', 'hold/paypal/shops/a/sandbox')
    await saveWebhookId(transaction, shopId, 'sandbox', webhookId)
    const saved = await saveItemType(transaction, shopId, { draft: { name: 'E-bike', category: 'e_bike', currency: 'EUR', value: eur(2400_00), hold: eur(300_00), dayRate: eur(40_00), accessories: [], views: [{ label: 'Frame', outline: 'whole_side', required: true }] } }, new Date())
    if (!saved.ok) throw new Error(saved.reason)
    await addItems(transaction, { itemTypeId: saved.id, count: 1, size: '', serial: '' }, new Date())
    return saved.id
  })
  accountId = (await inShop(database, owner, (transaction) => findPayPalAccount(transaction, shopId, 'sandbox')))?.id ?? ''
})

beforeEach(() => {
  sent = []
  paypal = fake
})

describe('asking for the fee to be captured', () => {
  it('records one execution and sends it to the worker, once', async () => {
    const { rentalId } = await waitingRental(true)
    const first = await requestFeeCapture(dependencies(), shopId, rentalId)
    const again = await requestFeeCapture(dependencies(), shopId, rentalId)
    expect(first).toMatchObject({ ok: true })
    expect(again).toEqual(first)
    expect(sent).toHaveLength(2)
    expect(sent[0]).toMatchObject({ queue: 'executions', group: rentalId })
    expect(sent[0]?.deduplicationId).toBe(sent[1]?.deduplicationId)
  })
})

describe('running an execution', () => {
  it('captures the fee with its key and books the rental, and a second run does nothing', async () => {
    const { rentalId } = await waitingRental(true)
    const requested = await requestFeeCapture(dependencies(), shopId, rentalId)
    if (!requested.ok) throw new Error(requested.reason)
    expect(await runExecution(dependencies(), { shopId, executionId: requested.executionId })).toBe('confirmed')
    expect(await runExecution(dependencies(), { shopId, executionId: requested.executionId })).toBe('nothing_to_do')
    expect(await stateOf(rentalId)).toBe('booked')
    expect(await feesFor(rentalId)).toBe(1)
  })

  it('throws while PayPal cannot be reached, so the queue tries again, and leaves the execution waiting', async () => {
    const { rentalId } = await waitingRental(true)
    const requested = await requestFeeCapture(dependencies(), shopId, rentalId)
    if (!requested.ok) throw new Error(requested.reason)
    paypal = { ...fake, captureFeeOrder: () => Promise.resolve(fail({ kind: 'unavailable', issue: undefined, description: undefined, debugId: undefined })) }
    await expect(runExecution(dependencies(), { shopId, executionId: requested.executionId })).rejects.toThrow(/unavailable/)
    expect(await stateOf(rentalId)).toBe('pending_payment')
    paypal = fake
    expect(await runExecution(dependencies(), { shopId, executionId: requested.executionId })).toBe('confirmed')
  })
})

describe('an event from PayPal', () => {
  it('books the rental when the renter approved its fee order, though they never came back to Hold', async () => {
    const { rentalId, orderId } = await waitingRental(true)
    const eventId = await delivered('CHECKOUT.ORDER.APPROVED', { id: orderId, status: 'APPROVED' })
    expect(await applyPayPalEvent(dependencies(), { shopId, eventId })).toBe('applied')
    expect(await stateOf(rentalId)).toBe('booked')
    expect(await feesFor(rentalId)).toBe(1)
  })

  it('confirms a fee PayPal captured, once, however often the event comes', async () => {
    const { rentalId, orderId } = await waitingRental(true)
    const captured = await fake.captureFeeOrder({ orderId, idempotencyKey: 'captured-elsewhere' })
    if (!captured.ok) throw new Error(captured.error.kind)
    const resource = { id: captured.value.captureId, supplementary_data: { related_ids: { order_id: orderId } } }
    expect(await applyPayPalEvent(dependencies(), { shopId, eventId: await delivered('PAYMENT.CAPTURE.COMPLETED', resource) })).toBe('applied')
    expect(await applyPayPalEvent(dependencies(), { shopId, eventId: await delivered('PAYMENT.CAPTURE.COMPLETED', resource) })).toBe('applied')
    expect(await stateOf(rentalId)).toBe('booked')
    expect(await feesFor(rentalId)).toBe(1)
  })

  it('is never applied when its signature is not PayPal’s', async () => {
    const { rentalId, orderId } = await waitingRental(true)
    const eventId = await delivered('CHECKOUT.ORDER.APPROVED', { id: orderId }, 'forged')
    expect(await applyPayPalEvent(dependencies(), { shopId, eventId })).toBe('rejected')
    expect(await stateOf(rentalId)).toBe('pending_payment')
    const [event] = await database.select().from(paypalEvents).where(eq(paypalEvents.id, eventId))
    expect(event).toMatchObject({ verification: 'rejected', processing: 'ignored' })
  })

  it('believes PayPal’s record, not the event: an order the event calls approved but PayPal does not is left alone', async () => {
    const { rentalId, orderId } = await waitingRental(false)
    const eventId = await delivered('CHECKOUT.ORDER.APPROVED', { id: orderId, status: 'APPROVED' })
    expect(await applyPayPalEvent(dependencies(), { shopId, eventId })).toBe('ignored')
    expect(await stateOf(rentalId)).toBe('pending_payment')
  })

  it('is kept and ignored when it is about nothing Hold acts on yet', async () => {
    const eventId = await delivered('CUSTOMER.DISPUTE.CREATED', { id: 'PP-D-1' })
    expect(await applyPayPalEvent(dependencies(), { shopId, eventId })).toBe('ignored')
  })
})

describe('the outbox relay', () => {
  it('sends a message whose direct send failed, grouped by its rental and deduplicated by its execution, then marks it sent', async () => {
    const { rentalId } = await waitingRental(true)
    const down = { ...dependencies(), send: () => Promise.reject(new Error('SQS is down')) }
    await expect(requestFeeCapture(down, shopId, rentalId)).rejects.toThrow(/SQS is down/)
    sent = []
    expect(await relayOutbox(dependencies(), 100)).toBeGreaterThan(0)
    const relayed = sent.find((message) => message.queue === 'executions' && message.group === rentalId)
    expect(relayed?.deduplicationId).toMatch(/^execution-/)
    expect(await relayOutbox(dependencies(), 100)).toBe(0)
  })

  it('leaves a message waiting when its queue cannot take it', async () => {
    const { rentalId } = await waitingRental(true)
    await inShop(database, { role: 'hold_app', shopId }, (transaction) => transaction.insert(outbox).values({ shopId, queue: 'executions', messageGroup: rentalId, payload: { executionId: 'x' } }))
    const failing = { ...dependencies(), send: () => Promise.reject(new Error('SQS is down')) }
    await expect(relayOutbox(failing, 100)).rejects.toThrow(/SQS is down/)
    expect((await database.select().from(outbox).where(eq(outbox.state, 'pending'))).length).toBeGreaterThan(0)
  })
})
