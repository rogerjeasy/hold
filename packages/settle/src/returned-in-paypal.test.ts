import { approveClaim, claimWorkspace, draftClaim, executions, inShop, moneyEvents, presentClaim, publishPriceList, rentals, replyToClaim, staffRoles } from '@hold/db'
import { and, eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applyPayPalEvent, createMemoryScheduler, requestHoldPlacement, runExecution } from './index.ts'
import type { SettleDependencies } from './index.ts'
import { createSettleFixture, eur } from './testing/settle-fixture.ts'

// Money that leaves a shop in PayPal without Hold, such as a refund from PayPal's own dashboard or a reversal after a
// lost dispute, reaches the rental's money log once PayPal's verified event and a read-back of PayPal's record agree
// (architecture.md sections 8.6 and 8.7). It is recorded as money PayPal returned, never as a refund Hold made.

const NOW = new Date('2026-10-20T09:00:00Z')
let fixture: Awaited<ReturnType<typeof createSettleFixture>>
let userId: string
const dependencies = (): SettleDependencies => ({ database: fixture.database, paypalFor: () => fixture.fake, paypalMode: 'sandbox', send: () => Promise.resolve(), scheduler: createMemoryScheduler(), notifier: { tell: () => Promise.resolve() }, renterAsk: { approval: () => Promise.reject(new Error('Not used')) }, now: () => NOW })
const act = <Result>(work: Parameters<typeof fixture.inShop<Result>>[0]) => inShop(fixture.database, { role: 'hold_app', shopId: fixture.shopId, userId }, work)
const captureUrl = (captureId: string) => `https://api-m.sandbox.paypal.com/v2/payments/captures/${captureId}`

// A returned rental whose renter accepted a €35 claim, captured from the hold and confirmed.
async function charged() {
  const rental = await fixture.approvedHold(dependencies())
  const placement = await requestHoldPlacement(dependencies(), fixture.shopId, rental.rentalId)
  if (!placement.ok) throw new Error(placement.reason)
  await runExecution(dependencies(), { shopId: fixture.shopId, executionId: placement.executionId })
  await fixture.database.update(rentals).set({ state: 'inspecting' }).where(eq(rentals.id, rental.rentalId))
  const price = (await act((transaction) => claimWorkspace(transaction, rental.rentalId)))?.prices[0]?.id ?? ''
  const drafted = await act((transaction) => draftClaim(transaction, rental.rentalId, userId, [{ priceEntryId: price, reason: 'Verified scratch.' }], NOW))
  if (!drafted.ok) throw new Error(drafted.reason)
  await act((transaction) => approveClaim(transaction, drafted.claimId, userId, NOW))
  await act((transaction) => presentClaim(transaction, drafted.claimId, userId, NOW))
  const accepted = await act((transaction) => replyToClaim(transaction, rental.rentalId, 'accept', '', NOW))
  if (!accepted.ok || accepted.executionId === null) throw new Error('No capture')
  expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId: accepted.executionId })).toBe('confirmed')
  const [execution] = await fixture.database.select().from(executions).where(eq(executions.id, accepted.executionId))
  return { rentalId: rental.rentalId, captureId: execution?.paypalResourceIds['capture'] ?? '' }
}
const returnedInPayPal = (rentalId: string) => fixture.database.select().from(moneyEvents).where(and(eq(moneyEvents.rentalId, rentalId), eq(moneyEvents.kind, 'refunded_in_paypal')))

beforeAll(async () => {
  fixture = await createSettleFixture(() => NOW)
  userId = (await fixture.inShop((transaction) => transaction.select().from(staffRoles)))[0]?.userId ?? ''
})

beforeEach(async () => {
  await act((transaction) => publishPriceList(transaction, fixture.shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries: [{ description: 'Scratch', category: 'damage', amount: { cents: 3500, currency: 'EUR' } }], wearPolicy: 'Wear.' }, NOW))
})

describe('money PayPal returned to the renter without Hold', () => {
  it('records a refund made in PayPal on a capture Hold made, once, from PayPal\'s own record of it', async () => {
    const { rentalId, captureId } = await charged()
    const refund = await fixture.fake.refundCapture({ captureId, amount: eur(20_00), idempotencyKey: 'made-in-the-dashboard' })
    if (!refund.ok) throw new Error('No refund')
    const resource = { id: refund.value.refundId, links: [{ rel: 'up', href: captureUrl(captureId) }] }
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId: await fixture.delivered('PAYMENT.CAPTURE.REFUNDED', resource) })).toBe('applied')
    expect(await returnedInPayPal(rentalId)).toEqual([expect.objectContaining({ amountCents: 20_00, currency: 'EUR', paypalReference: refund.value.refundId })])
    // PayPal may deliver it twice; the money log takes it once.
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId: await fixture.delivered('PAYMENT.CAPTURE.REFUNDED', resource) })).toBe('applied')
    expect(await returnedInPayPal(rentalId)).toHaveLength(1)
    // Hold's own refunds are untouched: none was made.
    expect(await fixture.database.select().from(moneyEvents).where(and(eq(moneyEvents.rentalId, rentalId), eq(moneyEvents.kind, 'refunded')))).toEqual([])
  })

  it('records a reversal PayPal made on a capture Hold made, only once PayPal reads the capture back as reversed', async () => {
    const { rentalId, captureId } = await charged()
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId: await fixture.delivered('PAYMENT.CAPTURE.REVERSED', { id: captureId }) })).toBe('ignored')
    expect(await returnedInPayPal(rentalId)).toEqual([])
    fixture.fake.reverseCapture(captureId)
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId: await fixture.delivered('PAYMENT.CAPTURE.REVERSED', { id: captureId }) })).toBe('applied')
    expect(await returnedInPayPal(rentalId)).toEqual([expect.objectContaining({ amountCents: 35_00, currency: 'EUR', paypalReference: `${captureId}:reversed` })])
  })

  it('believes nothing an event says: a forged event, or a refund of a capture Hold never made, records nothing', async () => {
    const { rentalId, captureId } = await charged()
    const refund = await fixture.fake.refundCapture({ captureId, amount: eur(5_00), idempotencyKey: 'forged-check' })
    if (!refund.ok) throw new Error('No refund')
    const forged = await fixture.delivered('PAYMENT.CAPTURE.REFUNDED', { id: refund.value.refundId, links: [{ rel: 'up', href: captureUrl(captureId) }] }, 'forged')
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId: forged })).toBe('rejected')
    // The event names another capture than the refund's: PayPal's record of the refund does not agree.
    const elsewhere = await fixture.delivered('PAYMENT.CAPTURE.REFUNDED', { id: refund.value.refundId, links: [{ rel: 'up', href: captureUrl('CAPTURE-NOT-HOLDS') }] })
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId: elsewhere })).toBe('ignored')
    expect(await returnedInPayPal(rentalId)).toEqual([])
  })
})
