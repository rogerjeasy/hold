import { moneyEvents, outbox, paypalEvents, rentalDetail } from '@hold/db'
import { fail } from '@hold/domain'
import type { PayPalHolds } from '@hold/paypal'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applyPayPalEvent, createMemoryScheduler, relayOutbox, requestFeeCapture, runExecution } from './index.ts'
import type { QueueMessage, SettleDependencies } from './index.ts'
import { createSettleFixture } from './testing/settle-fixture.ts'
import type { SettleFixture } from './testing/settle-fixture.ts'

let fixture: SettleFixture
let sent: QueueMessage[]
let paypal: PayPalHolds

const dependencies = (): SettleDependencies => ({
  database: fixture.database,
  paypalFor: () => paypal,
  paypalMode: 'sandbox',
  send: (message) => {
    sent.push(message)
    return Promise.resolve()
  },
  scheduler: createMemoryScheduler(),
  notifier: { tell: () => Promise.resolve() },
  renterAsk: { approval: () => Promise.reject(new Error('Not asked here.')) },
  now: () => new Date(),
})

const waitingRental = (approved: boolean) => fixture.waitingRental(approved)
const delivered = (type: string, resource: Record<string, unknown>, signature?: string) => fixture.delivered(type, resource, signature)
const stateOf = async (rentalId: string) => (await fixture.inShop((transaction) => rentalDetail(transaction, rentalId, new Date())))?.state
const feesFor = async (rentalId: string) => (await fixture.database.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId))).length

beforeAll(async () => {
  fixture = await createSettleFixture()
})

beforeEach(() => {
  sent = []
  paypal = fixture.fake
})

describe('asking for the fee to be captured', () => {
  it('records one execution and sends it to the worker, once', async () => {
    const { rentalId } = await waitingRental(true)
    const first = await requestFeeCapture(dependencies(), fixture.shopId, rentalId)
    const again = await requestFeeCapture(dependencies(), fixture.shopId, rentalId)
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
    const requested = await requestFeeCapture(dependencies(), fixture.shopId, rentalId)
    if (!requested.ok) throw new Error(requested.reason)
    expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId: requested.executionId })).toBe('confirmed')
    expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId: requested.executionId })).toBe('nothing_to_do')
    expect(await stateOf(rentalId)).toBe('booked')
    expect(await feesFor(rentalId)).toBe(1)
  })

  it('throws while PayPal cannot be reached, so the queue tries again, and leaves the execution waiting', async () => {
    const { rentalId } = await waitingRental(true)
    const requested = await requestFeeCapture(dependencies(), fixture.shopId, rentalId)
    if (!requested.ok) throw new Error(requested.reason)
    paypal = { ...fixture.fake, captureFeeOrder: () => Promise.resolve(fail({ kind: 'unavailable', issue: undefined, description: undefined, debugId: undefined })) }
    await expect(runExecution(dependencies(), { shopId: fixture.shopId, executionId: requested.executionId })).rejects.toThrow(/unavailable/)
    expect(await stateOf(rentalId)).toBe('pending_payment')
    paypal = fixture.fake
    expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId: requested.executionId })).toBe('confirmed')
  })
})

describe('an event from PayPal', () => {
  it('books the rental when the renter approved its fee order, though they never came back to Hold', async () => {
    const { rentalId, orderId } = await waitingRental(true)
    const eventId = await delivered('CHECKOUT.ORDER.APPROVED', { id: orderId, status: 'APPROVED' })
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId })).toBe('applied')
    expect(await stateOf(rentalId)).toBe('booked')
    expect(await feesFor(rentalId)).toBe(1)
  })

  it('confirms a fee PayPal captured, once, however often the event comes', async () => {
    const { rentalId, orderId } = await waitingRental(true)
    const captured = await fixture.fake.captureFeeOrder({ orderId, idempotencyKey: 'captured-elsewhere' })
    if (!captured.ok) throw new Error(captured.error.kind)
    const resource = { id: captured.value.captureId, supplementary_data: { related_ids: { order_id: orderId } } }
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId: await delivered('PAYMENT.CAPTURE.COMPLETED', resource) })).toBe('applied')
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId: await delivered('PAYMENT.CAPTURE.COMPLETED', resource) })).toBe('applied')
    expect(await stateOf(rentalId)).toBe('booked')
    expect(await feesFor(rentalId)).toBe(1)
  })

  it('is never applied when its signature is not PayPal’s', async () => {
    const { rentalId, orderId } = await waitingRental(true)
    const eventId = await delivered('CHECKOUT.ORDER.APPROVED', { id: orderId }, 'forged')
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId })).toBe('rejected')
    expect(await stateOf(rentalId)).toBe('pending_payment')
    const [event] = await fixture.database.select().from(paypalEvents).where(eq(paypalEvents.id, eventId))
    expect(event).toMatchObject({ verification: 'rejected', processing: 'ignored' })
  })

  it('believes PayPal’s record, not the event: an order the event calls approved but PayPal does not is left alone', async () => {
    const { rentalId, orderId } = await waitingRental(false)
    const eventId = await delivered('CHECKOUT.ORDER.APPROVED', { id: orderId, status: 'APPROVED' })
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId })).toBe('ignored')
    expect(await stateOf(rentalId)).toBe('pending_payment')
  })

  it('is kept and ignored when it is about nothing Hold acts on yet', async () => {
    const eventId = await delivered('BILLING.SUBSCRIPTION.CREATED', { id: 'I-1' })
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId })).toBe('ignored')
  })

  // A dispute is answered from the operations agent's queue, where a person approves the answer. The event brings it to
  // the owner now instead of the next night, once PayPal's own list shows it open.
  const disputeChecks = async () => (await fixture.inShop((transaction) => transaction.select().from(outbox))).filter((row) => row.queue === 'ops-agent' && (row.payload as { trigger?: string }).trigger === 'dispute_opened')

  it('asks the operations agent to look now when PayPal reports a dispute it then shows open', async () => {
    const before = (await disputeChecks()).length
    fixture.fake.openDispute({ id: 'PP-D-2', open: true, amount: { cents: 35_00, currency: 'EUR' }, responseDueAt: new Date('2026-10-30T09:00:00Z'), captureIds: ['CAPTURE-1'] })
    const eventId = await delivered('CUSTOMER.DISPUTE.CREATED', { id: 'PP-D-2' })
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId })).toBe('applied')
    expect(await disputeChecks()).toHaveLength(before + 1)
  })

  // PayPal's sandbox, 28 October 2026: a new dispute sat in PayPal's own review for its first minutes, so the shop was
  // asked for nothing when it was created; it came to the shop later, which PayPal reports as an update.
  it('asks the operations agent to look when an update brings a dispute to the shop', async () => {
    const before = (await disputeChecks()).length
    fixture.fake.openDispute({ id: 'PP-D-3', open: true, amount: { cents: 9_00, currency: 'EUR' }, responseDueAt: new Date('2026-11-17T16:04:18Z'), captureIds: ['CAPTURE-3'] })
    const eventId = await delivered('CUSTOMER.DISPUTE.UPDATED', { id: 'PP-D-3' })
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId })).toBe('applied')
    expect(await disputeChecks()).toHaveLength(before + 1)
  })

  it('believes PayPal’s list, not the event: a dispute PayPal does not show open asks for nothing', async () => {
    const before = (await disputeChecks()).length
    const eventId = await delivered('CUSTOMER.DISPUTE.CREATED', { id: 'PP-D-NOT-OPEN' })
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId })).toBe('ignored')
    expect(await disputeChecks()).toHaveLength(before)
  })
})

describe('the outbox relay', () => {
  it('sends a message whose direct send failed, grouped by its rental and deduplicated by its execution, then marks it sent', async () => {
    const { rentalId } = await waitingRental(true)
    const down = { ...dependencies(), send: () => Promise.reject(new Error('SQS is down')) }
    await expect(requestFeeCapture(down, fixture.shopId, rentalId)).rejects.toThrow(/SQS is down/)
    sent = []
    expect(await relayOutbox(dependencies(), 100)).toBeGreaterThan(0)
    const relayed = sent.find((message) => message.queue === 'executions' && message.group === rentalId)
    expect(relayed?.deduplicationId).toMatch(/^execution-/)
    expect(await relayOutbox(dependencies(), 100)).toBe(0)
  })

  it('leaves a message waiting when its queue cannot take it', async () => {
    const { rentalId } = await waitingRental(true)
    await fixture.inShop((transaction) => transaction.insert(outbox).values({ shopId: fixture.shopId, queue: 'executions', messageGroup: rentalId, payload: { executionId: 'x' } }))
    const failing = { ...dependencies(), send: () => Promise.reject(new Error('SQS is down')) }
    await expect(relayOutbox(failing, 100)).rejects.toThrow(/SQS is down/)
    expect((await fixture.database.select().from(outbox).where(eq(outbox.state, 'pending'))).length).toBeGreaterThan(0)
  })
})
