import { moneyEvents, quoteExtension, rentalDetail, rentalExtensionsOf, rentals, saveExtensionOrder } from '@hold/db'
import { fail } from '@hold/domain'
import type { PayPalHolds } from '@hold/paypal'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryScheduler, requestExtensionCapture, requestHoldPlacement, runExecution } from './index.ts'
import type { SettleDependencies } from './index.ts'
import { createSettleFixture, eur, FEE } from './testing/settle-fixture.ts'
import type { SettleFixture } from './testing/settle-fixture.ts'

// More days a renter paid for from their phone (architecture.md section 6.14): captured by the worker from their own
// PayPal order, never from the hold.

let fixture: SettleFixture
let paypal: PayPalHolds

const dependencies = (): SettleDependencies => ({
  database: fixture.database,
  paypalFor: () => paypal,
  paypalMode: 'sandbox',
  send: () => Promise.resolve(),
  scheduler: createMemoryScheduler(),
  notifier: { tell: () => Promise.resolve() },
  renterAsk: { approval: () => Promise.reject(new Error('Not asked here.')) },
  now: () => new Date(),
})

// A rental with its hold placed, out with the renter, and one more day approved in PayPal. The fixture has one e-bike,
// booked every other day, so one more day never meets the next booking.
async function approvedExtension() {
  const { rentalId } = await fixture.approvedHold(dependencies())
  const placement = await requestHoldPlacement(dependencies(), fixture.shopId, rentalId)
  if (!placement.ok) throw new Error(placement.reason)
  await runExecution(dependencies(), { shopId: fixture.shopId, executionId: placement.executionId })
  // The handover itself is not this test's business.
  await fixture.inShop((transaction) => transaction.update(rentals).set({ state: 'out' }).where(eq(rentals.id, rentalId)))
  const endsAt = (await fixture.inShop((transaction) => rentalDetail(transaction, rentalId, new Date())))?.endsAt ?? new Date()
  const quoted = await fixture.inShop((transaction) => quoteExtension(transaction, rentalId, new Date(endsAt.getTime() + 86_400_000), 'link', new Date()))
  if (!quoted.ok) throw new Error(quoted.problem.kind)
  const order = await fixture.fake.createFeeOrder({ amount: eur(FEE), rentalReference: rentalId, description: 'One more day', returnUrl: 'https://hold.test/extended', cancelUrl: 'https://hold.test/r', idempotencyKey: `extension-order-${quoted.extensionId}` })
  if (!order.ok) throw new Error(order.error.kind)
  await fixture.inShop((transaction) => saveExtensionOrder(transaction, quoted.extensionId, order.value.orderId))
  fixture.fake.approveOrder(order.value.orderId)
  return { rentalId, orderId: order.value.orderId, endsAt }
}

const endOf = async (rentalId: string) => (await fixture.inShop((transaction) => rentalDetail(transaction, rentalId, new Date())))?.endsAt
const extensionLines = async (rentalId: string) => (await fixture.database.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId))).filter((line) => line.kind === 'extension_captured')

beforeAll(async () => {
  fixture = await createSettleFixture()
})

beforeEach(() => {
  paypal = fixture.fake
})

describe('capturing more days', () => {
  it('captures the quoted fee from its own order once, and leaves the hold alone', async () => {
    const { rentalId, orderId, endsAt } = await approvedExtension()
    const requested = await requestExtensionCapture(dependencies(), fixture.shopId, rentalId, orderId)
    if (!requested.ok) throw new Error(requested.reason)
    expect(await endOf(rentalId)).toEqual(new Date(endsAt.getTime() + 86_400_000))
    expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId: requested.executionId })).toBe('confirmed')
    expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId: requested.executionId })).toBe('nothing_to_do')
    expect(await extensionLines(rentalId)).toMatchObject([{ amountCents: FEE }])
    expect((await fixture.database.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId))).filter((line) => line.kind === 'hold_captured')).toHaveLength(0)
  })

  it('tries again while PayPal cannot be reached', async () => {
    const { rentalId, orderId } = await approvedExtension()
    const requested = await requestExtensionCapture(dependencies(), fixture.shopId, rentalId, orderId)
    if (!requested.ok) throw new Error(requested.reason)
    paypal = { ...fixture.fake, captureFeeOrder: () => Promise.resolve(fail({ kind: 'unavailable', issue: undefined, description: undefined, debugId: undefined })) }
    await expect(runExecution(dependencies(), { shopId: fixture.shopId, executionId: requested.executionId })).rejects.toThrow(/unavailable/)
    paypal = fixture.fake
    expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId: requested.executionId })).toBe('confirmed')
  })

  it('puts the old end back and takes nothing when PayPal refuses', async () => {
    const { rentalId, orderId, endsAt } = await approvedExtension()
    const requested = await requestExtensionCapture(dependencies(), fixture.shopId, rentalId, orderId)
    if (!requested.ok) throw new Error(requested.reason)
    paypal = { ...fixture.fake, captureFeeOrder: () => Promise.resolve(fail({ kind: 'declined', issue: 'INSTRUMENT_DECLINED', description: undefined, debugId: undefined })) }
    expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId: requested.executionId })).toBe('failed')
    expect(await endOf(rentalId)).toEqual(endsAt)
    expect(await extensionLines(rentalId)).toEqual([])
    expect((await fixture.inShop((transaction) => rentalExtensionsOf(transaction, rentalId)))[0]?.state).toBe('failed')
  })
})
