import { auditLog, executions, moneyEvents, quoteExtension, rentalDetail, rentalExtensions, rentalExtensionsOf, rentals, saveExtensionOrder } from '@hold/db'
import { fail } from '@hold/domain'
import type { PayPalHolds } from '@hold/paypal'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applyPayPalEvent, createMemoryScheduler, requestExtensionCapture, requestHoldPlacement, runExecution } from './index.ts'
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
  const order = await fixture.fake.createFeeOrder({ amount: eur(FEE), rentalReference: rentalId, description: 'One more day', brandName: 'Ribeira Bikes', returnUrl: 'https://hold.test/extended', cancelUrl: 'https://hold.test/r', idempotencyKey: `extension-order-${quoted.extensionId}` })
  if (!order.ok) throw new Error(order.error.kind)
  await fixture.inShop((transaction) => saveExtensionOrder(transaction, quoted.extensionId, order.value.orderId))
  fixture.fake.approveOrder(order.value.orderId)
  return { rentalId, orderId: order.value.orderId, endsAt }
}

const extensionOf = async (rentalId: string) => (await fixture.database.select().from(rentalExtensions).where(eq(rentalExtensions.rentalId, rentalId)))[0]
const executionOf = async (executionId: string) => (await fixture.database.select().from(executions).where(eq(executions.id, executionId)))[0]

// PayPal reports the capture as pending, and keeps saying so when read back, until told otherwise.
async function pendingExtension(status: 'pending' | 'completed' | 'declined' = 'pending') {
  const approved = await approvedExtension()
  const requested = await requestExtensionCapture(dependencies(), fixture.shopId, approved.rentalId, approved.orderId)
  if (!requested.ok) throw new Error(requested.reason)
  const captured = await fixture.fake.captureFeeOrder({ orderId: approved.orderId, idempotencyKey: `peek-${requested.executionId}` })
  if (!captured.ok) throw new Error(captured.error.kind)
  const reading = (shown: string) => () => Promise.resolve({ ok: true as const, value: { ...captured.value, status: shown as 'pending' } })
  paypal = { ...fixture.fake, captureFeeOrder: reading('pending'), readFeePayment: reading('pending') }
  const scheduler = createMemoryScheduler()
  expect(await runExecution({ ...dependencies(), scheduler }, { shopId: fixture.shopId, executionId: requested.executionId })).toBe('waiting')
  paypal = status === 'completed' ? fixture.fake : { ...fixture.fake, readFeePayment: reading(status) }
  return { ...approved, executionId: requested.executionId, captureId: captured.value.captureId, scheduler }
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

  it('never undoes a capture that took another amount: it is kept in the money log, and a person is asked to look', async () => {
    const other = await approvedExtension()
    const second = await requestExtensionCapture(dependencies(), fixture.shopId, other.rentalId, other.orderId)
    if (!second.ok) throw new Error(second.reason)
    const captured = await fixture.fake.captureFeeOrder({ orderId: other.orderId, idempotencyKey: 'peek-mismatch' })
    if (!captured.ok) throw new Error(captured.error.kind)
    paypal = { ...fixture.fake, captureFeeOrder: () => Promise.resolve({ ok: true, value: { ...captured.value, amount: eur(1) } }) }
    expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId: second.executionId })).toBe('failed')
    expect(await endOf(other.rentalId)).toEqual(new Date(other.endsAt.getTime() + 86_400_000))
    expect(await extensionOf(other.rentalId)).toMatchObject({ state: 'capturing', attention: 'amount_mismatch', capturedCents: 1, paypalCaptureId: captured.value.captureId })
    expect(await extensionLines(other.rentalId)).toMatchObject([{ amountCents: 1 }])
    const flagged = (await fixture.database.select().from(auditLog).where(eq(auditLog.subjectId, other.rentalId))).map((line) => line.action)
    expect(flagged).toContain('extension.capture_mismatch')
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

describe('a capture PayPal reports as pending', () => {
  it('keeps the new end and the capture open, and sets one check for its deadline', async () => {
    const pending = await pendingExtension()
    expect(await endOf(pending.rentalId)).toEqual(new Date(pending.endsAt.getTime() + 86_400_000))
    expect(await extensionOf(pending.rentalId)).toMatchObject({ state: 'capturing', attention: null })
    expect(await executionOf(pending.executionId)).toMatchObject({ state: 'submitted', paypalResourceIds: { order: pending.orderId, capture: pending.captureId } })
    const execution = await executionOf(pending.executionId)
    const extension = await extensionOf(pending.rentalId)
    if (execution === undefined || extension === undefined) throw new Error('No capture.')
    const deadline = new Date(Math.max(extension.fromEndsAt.getTime(), execution.createdAt.getTime() + 24 * 3_600_000))
    expect(pending.scheduler.scheduled()).toEqual([{ name: `extension-due-${pending.executionId}`, at: deadline, message: { queue: 'executions', group: pending.rentalId, deduplicationId: `extension-due-${pending.executionId}`, body: { shopId: fixture.shopId, executionId: pending.executionId } } }])
  })

  it('is paid once PayPal’s own record says so, when its completed event comes, and never on the event’s word', async () => {
    const pending = await pendingExtension('pending')
    const forged = await fixture.delivered('PAYMENT.CAPTURE.COMPLETED', { id: pending.captureId }, 'forged')
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId: forged })).toBe('rejected')
    const early = await fixture.delivered('PAYMENT.CAPTURE.COMPLETED', { id: pending.captureId })
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId: early })).toBe('applied')
    expect(await extensionOf(pending.rentalId)).toMatchObject({ state: 'capturing' })
    paypal = fixture.fake
    const completed = await fixture.delivered('PAYMENT.CAPTURE.COMPLETED', { id: pending.captureId })
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId: completed })).toBe('applied')
    expect(await extensionOf(pending.rentalId)).toMatchObject({ state: 'paid', attention: null })
    expect(await extensionLines(pending.rentalId)).toMatchObject([{ amountCents: FEE }])
  })

  it('puts the old end back when PayPal denies it', async () => {
    const pending = await pendingExtension('declined')
    const denied = await fixture.delivered('PAYMENT.CAPTURE.DENIED', { id: pending.captureId })
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId: denied })).toBe('applied')
    expect(await endOf(pending.rentalId)).toEqual(pending.endsAt)
    expect(await extensionOf(pending.rentalId)).toMatchObject({ state: 'failed' })
    expect(await extensionLines(pending.rentalId)).toEqual([])
  })

  it('gives up at its deadline: the old end comes back and nothing is counted as paid', async () => {
    const pending = await pendingExtension('pending')
    const [check] = pending.scheduler.scheduled()
    if (check === undefined) throw new Error('No check.')
    const late = { ...dependencies(), now: () => new Date(check.at.getTime() + 60_000) }
    expect(await runExecution(late, { shopId: fixture.shopId, executionId: pending.executionId })).toBe('failed')
    expect(await endOf(pending.rentalId)).toEqual(pending.endsAt)
    expect(await extensionOf(pending.rentalId)).toMatchObject({ state: 'failed', attention: null })
    expect(await executionOf(pending.executionId)).toMatchObject({ state: 'failed', lastError: 'payment_expired' })
    expect(await extensionLines(pending.rentalId)).toEqual([])
  })

  it('puts a payment PayPal completes after Hold gave up before a person, and in the money log', async () => {
    const pending = await pendingExtension('pending')
    const [check] = pending.scheduler.scheduled()
    if (check === undefined) throw new Error('No check.')
    await runExecution({ ...dependencies(), now: () => new Date(check.at.getTime() + 60_000) }, { shopId: fixture.shopId, executionId: pending.executionId })
    paypal = fixture.fake
    const completed = await fixture.delivered('PAYMENT.CAPTURE.COMPLETED', { id: pending.captureId })
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId: completed })).toBe('applied')
    expect(await endOf(pending.rentalId)).toEqual(pending.endsAt)
    expect(await extensionOf(pending.rentalId)).toMatchObject({ state: 'failed', attention: 'paid_after_expiry', capturedCents: FEE, paypalCaptureId: pending.captureId })
    expect(await extensionLines(pending.rentalId)).toMatchObject([{ amountCents: FEE }])
    const audited = (await fixture.database.select().from(auditLog).where(eq(auditLog.subjectId, pending.rentalId))).map((line) => line.action)
    expect(audited).toContain('extension.paid_after_expiry')
  })
})
