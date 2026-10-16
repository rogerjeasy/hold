import { addDays } from '@hold/domain'
import { executions, moneyEvents, rentalDetail, rentalHold } from '@hold/db'
import { fail } from '@hold/domain'
import type { PayPalHolds } from '@hold/paypal'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applyPayPalEvent, createMemoryScheduler, requestHoldPlacement, runExecution } from './index.ts'
import type { MemoryScheduler, QueueMessage, SettleDependencies } from './index.ts'
import { createSettleFixture, HOLD } from './testing/settle-fixture.ts'
import type { SettleFixture } from './testing/settle-fixture.ts'

let fixture: SettleFixture
let sent: QueueMessage[]
let scheduler: MemoryScheduler
let paypal: PayPalHolds

const dependencies = (): SettleDependencies => ({
  database: fixture.database,
  paypalFor: () => paypal,
  paypalMode: 'sandbox',
  send: (message) => {
    sent.push(message)
    return Promise.resolve()
  },
  scheduler,
  notifier: { tell: () => Promise.resolve() },
  renterAsk: { approval: () => Promise.reject(new Error('Not asked here.')) },
  now: () => new Date(),
})

const approvedHold = (options: { readonly approve?: boolean } = {}) => fixture.approvedHold(dependencies(), options)

const stateOf = async (rentalId: string) => (await fixture.inShop((transaction) => rentalDetail(transaction, rentalId, new Date())))?.state
const holdOf = (rentalId: string) => fixture.inShop((transaction) => rentalHold(transaction, rentalId))
const holdLines = async (rentalId: string) => (await fixture.database.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId))).filter((line) => line.kind === 'hold_placed')

async function placed(rentalId: string): Promise<string> {
  const requested = await requestHoldPlacement(dependencies(), fixture.shopId, rentalId)
  if (!requested.ok) throw new Error(requested.reason)
  return requested.executionId
}

beforeAll(async () => {
  fixture = await createSettleFixture()
})

beforeEach(() => {
  sent = []
  scheduler = createMemoryScheduler()
  paypal = fixture.fake
})

describe('asking for the hold to be placed', () => {
  it('records one execution and sends it to the worker, once', async () => {
    const { rentalId } = await approvedHold()
    const first = await requestHoldPlacement(dependencies(), fixture.shopId, rentalId)
    const again = await requestHoldPlacement(dependencies(), fixture.shopId, rentalId)
    expect(first).toMatchObject({ ok: true })
    expect(again).toEqual(first)
    const toWorker = sent.filter((message) => message.queue === 'executions' && message.group === rentalId)
    expect(toWorker.slice(-2).map((message) => message.deduplicationId)).toEqual([toWorker.at(-1)?.deduplicationId, toWorker.at(-1)?.deduplicationId])
  })
})

describe('authorizing the hold', () => {
  it('places the hold with its key, makes the rental ready, and schedules its upkeep from PayPal’s clocks', async () => {
    const { rentalId } = await approvedHold()
    const executionId = await placed(rentalId)
    expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId })).toBe('confirmed')
    expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId })).toBe('nothing_to_do')
    expect(await stateOf(rentalId)).toBe('ready')
    const hold = await holdOf(rentalId)
    expect(hold).toMatchObject({ state: 'placed', reservedCents: HOLD })
    expect(await holdLines(rentalId)).toHaveLength(1)
    const validUntil = hold?.validUntil ?? new Date(0)
    expect(scheduler.scheduled().map(({ at, message }) => ({ at, kind: message.body['kind'], queue: message.queue }))).toEqual([
      { at: addDays(validUntil, -3), kind: 'replace', queue: 'upkeep' },
      { at: validUntil, kind: 'expire', queue: 'upkeep' },
    ])
  })

  it('leaves the rental waiting when the renter’s funding is declined, and schedules nothing', async () => {
    const { rentalId, orderId } = await approvedHold()
    fixture.fake.declineFunding(orderId)
    const executionId = await placed(rentalId)
    expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId })).toBe('failed')
    expect(await stateOf(rentalId)).toBe('awaiting_hold')
    expect((await holdOf(rentalId))?.state).toBe('requested')
    expect((await fixture.database.select().from(executions).where(eq(executions.id, executionId)))[0]).toMatchObject({ state: 'failed', lastError: 'declined' })
    expect(scheduler.scheduled()).toEqual([])
  })

  it('throws while PayPal cannot be reached, so the queue tries again', async () => {
    const { rentalId } = await approvedHold()
    const executionId = await placed(rentalId)
    paypal = { ...fixture.fake, placeHold: () => Promise.resolve(fail({ kind: 'unavailable', issue: undefined, description: undefined, debugId: undefined })) }
    await expect(runExecution(dependencies(), { shopId: fixture.shopId, executionId })).rejects.toThrow(/unavailable/)
    expect(await stateOf(rentalId)).toBe('awaiting_hold')
    paypal = fixture.fake
    expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId })).toBe('confirmed')
  })

  it('schedules the upkeep on the next try when scheduling failed after the hold was placed, so no hold goes unwatched', async () => {
    const { rentalId } = await approvedHold()
    const executionId = await placed(rentalId)
    const working = scheduler
    scheduler = { ...working, at: () => Promise.reject(new Error('Scheduler is down')) }
    await expect(runExecution(dependencies(), { shopId: fixture.shopId, executionId })).rejects.toThrow(/Scheduler is down/)
    expect(await stateOf(rentalId)).toBe('ready')
    scheduler = working
    expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId })).toBe('nothing_to_do')
    expect(scheduler.scheduled()).toHaveLength(2)
  })
})

describe('PayPal’s events for a hold', () => {
  it('places the hold when the renter approved it in PayPal, though they never came back to Hold', async () => {
    const { rentalId, orderId } = await approvedHold()
    const eventId = await fixture.delivered('CHECKOUT.ORDER.APPROVED', { id: orderId, status: 'APPROVED' })
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId })).toBe('applied')
    expect(await stateOf(rentalId)).toBe('ready')
    expect(scheduler.scheduled()).toHaveLength(2)
  })

  it('confirms a hold PayPal authorized, once, however often the event comes', async () => {
    const { rentalId, orderId } = await approvedHold()
    const authorized = await fixture.fake.placeHold({ orderId, idempotencyKey: 'authorized-elsewhere' })
    if (!authorized.ok) throw new Error(authorized.error.kind)
    const resource = { id: authorized.value.authorizationId, status: 'CREATED', supplementary_data: { related_ids: { order_id: orderId } } }
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId: await fixture.delivered('PAYMENT.AUTHORIZATION.CREATED', resource) })).toBe('applied')
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId: await fixture.delivered('PAYMENT.AUTHORIZATION.CREATED', resource) })).toBe('applied')
    expect(await stateOf(rentalId)).toBe('ready')
    expect(await holdLines(rentalId)).toHaveLength(1)
  })

  it('believes PayPal’s record, not the event: an order PayPal shows unapproved is left alone', async () => {
    const { rentalId, orderId } = await approvedHold({ approve: false })
    const eventId = await fixture.delivered('CHECKOUT.ORDER.APPROVED', { id: orderId, status: 'APPROVED' })
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId })).toBe('ignored')
    expect(await stateOf(rentalId)).toBe('awaiting_hold')
  })
})
