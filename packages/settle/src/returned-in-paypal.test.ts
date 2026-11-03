import { approveClaim, claimWorkspace, decideClaim, draftClaim, executions, inShop, moneyEvents, presentClaim, publishPriceList, rentalDetail, rentals, replyToClaim, staffRoles } from '@hold/db'
import { and, eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { runClaimDeadline } from './claim-deadline.ts'
import { applyPayPalEvent, createMemoryScheduler, requestHoldPlacement, runExecution } from './index.ts'
import type { SettleDependencies } from './index.ts'
import { createSettleFixture, eur } from './testing/settle-fixture.ts'

// Money that leaves a shop in PayPal without Hold, such as a refund from PayPal's own dashboard or a reversal after a
// lost dispute, reaches the rental's money log once PayPal's verified event and a read-back of PayPal's record agree
// (architecture.md sections 8.6 and 8.7). It is recorded as money PayPal returned, never as a refund Hold made.

const NOW = new Date('2026-10-20T09:00:00Z')
let now = NOW
let fixture: Awaited<ReturnType<typeof createSettleFixture>>
let userId: string
const dependencies = (): SettleDependencies => ({ database: fixture.database, paypalFor: () => fixture.fake, paypalMode: 'sandbox', send: () => Promise.resolve(), scheduler: createMemoryScheduler(), notifier: { tell: () => Promise.resolve() }, renterAsk: { approval: () => Promise.reject(new Error('Not used')) }, now: () => now })
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
  now = NOW
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

// A claim captured before its reply period ended to protect it, then contested and waived: Hold refunds the capture.
async function waivedAfterProtectiveCapture() {
  const rental = await fixture.approvedHold(dependencies())
  const placement = await requestHoldPlacement(dependencies(), fixture.shopId, rental.rentalId)
  if (!placement.ok) throw new Error(placement.reason)
  await runExecution(dependencies(), { shopId: fixture.shopId, executionId: placement.executionId })
  await fixture.database.update(rentals).set({ state: 'inspecting' }).where(eq(rentals.id, rental.rentalId))
  const price = (await act((transaction) => claimWorkspace(transaction, rental.rentalId)))?.prices[0]?.id ?? ''
  const drafted = await act((transaction) => draftClaim(transaction, rental.rentalId, userId, [{ priceEntryId: price, reason: 'Verified scratch.' }], now))
  if (!drafted.ok) throw new Error(drafted.reason)
  await act((transaction) => approveClaim(transaction, drafted.claimId, userId, now))
  now = new Date(NOW.getTime() + 28 * 86400000)
  await act((transaction) => presentClaim(transaction, drafted.claimId, userId, now))
  await runClaimDeadline(dependencies(), { kind: 'claim_due', shopId: fixture.shopId, claimId: drafted.claimId })
  const capture = (await fixture.database.select().from(executions).where(eq(executions.rentalId, rental.rentalId))).find((row) => row.action === 'capture')
  if (capture === undefined) throw new Error('No protective capture')
  await runExecution(dependencies(), { shopId: fixture.shopId, executionId: capture.id })
  await act((transaction) => replyToClaim(transaction, rental.rentalId, 'contest', 'The mark was already there.', now))
  const decision = await act((transaction) => decideClaim(transaction, drafted.claimId, userId, 'waive', 'The handover photograph shows it.', now))
  if (!decision.ok) throw new Error(decision.reason)
  const [refund] = await fixture.database.select().from(executions).where(eq(executions.id, decision.executionId))
  if (refund === undefined) throw new Error('No refund execution')
  return { rentalId: rental.rentalId, refund }
}
const refundsOf = async (rentalId: string) => (await fixture.database.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId))).filter((row) => ['refunded', 'refunded_in_paypal', 'fee_refunded_in_paypal'].includes(row.kind))

describe('money PayPal returned, kept apart from what a claim may still take or give back', () => {
  it('records a refund of the rental fee made in PayPal, and leaves the claim\'s amounts as they were', async () => {
    const { rentalId } = await charged()
    const before = (await act((transaction) => claimWorkspace(transaction, rentalId)))?.amounts
    const [fee] = await fixture.database.select().from(moneyEvents).where(and(eq(moneyEvents.rentalId, rentalId), eq(moneyEvents.kind, 'fee_captured')))
    if (fee === undefined) throw new Error('No fee')
    const refund = await fixture.fake.refundCapture({ captureId: fee.paypalReference, amount: eur(fee.amountCents), idempotencyKey: 'fee-refund-in-the-dashboard' })
    if (!refund.ok) throw new Error('No refund')
    const event = await fixture.delivered('PAYMENT.CAPTURE.REFUNDED', { id: refund.value.refundId, links: [{ rel: 'up', href: captureUrl(fee.paypalReference) }] })
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId: event })).toBe('applied')
    expect(await refundsOf(rentalId)).toEqual([expect.objectContaining({ kind: 'fee_refunded_in_paypal', amountCents: fee.amountCents, returnedFrom: fee.paypalReference })])
    expect((await act((transaction) => claimWorkspace(transaction, rentalId)))?.amounts).toEqual(before)
  })

  it('counts a refund Hold started once, when PayPal\'s event comes before Hold knows the refund\'s id', async () => {
    const { rentalId, refund } = await waivedAfterProtectiveCapture()
    const captureId = refund.paypalResourceIds['capture'] ?? ''
    // Hold's call reached PayPal, but the worker stopped before saving the refund's id.
    const made = await fixture.fake.refundCapture({ captureId, amount: eur(refund.amountCents ?? 0), idempotencyKey: refund.idempotencyKey })
    if (!made.ok) throw new Error('No refund')
    const event = await fixture.delivered('PAYMENT.CAPTURE.REFUNDED', { id: made.value.refundId, links: [{ rel: 'up', href: captureUrl(captureId) }] })
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId: event })).toBe('applied')
    expect((await refundsOf(rentalId)).map((row) => [row.kind, row.amountCents, row.paypalReference])).toEqual([['refunded', refund.amountCents, made.value.refundId]])
    expect((await act((transaction) => rentalDetail(transaction, rentalId, now)))?.state).toBe('closed')
  })

  it('counts a refund Hold started once, when PayPal\'s event comes after Hold recorded it', async () => {
    const { rentalId, refund } = await waivedAfterProtectiveCapture()
    expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId: refund.id })).toBe('confirmed')
    const [saved] = await fixture.database.select().from(executions).where(eq(executions.id, refund.id))
    const event = await fixture.delivered('PAYMENT.CAPTURE.REFUNDED', { id: saved?.paypalResourceIds['refund'] ?? '', links: [{ rel: 'up', href: captureUrl(refund.paypalResourceIds['capture'] ?? '') }] })
    await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId: event })
    expect((await refundsOf(rentalId)).map((row) => row.kind)).toEqual(['refunded'])
  })

  it('records a reversal after a partial refund as only what was left of the capture', async () => {
    const { rentalId, captureId } = await charged()
    const refund = await fixture.fake.refundCapture({ captureId, amount: eur(10_00), idempotencyKey: 'part-then-reversed' })
    if (!refund.ok) throw new Error('No refund')
    await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId: await fixture.delivered('PAYMENT.CAPTURE.REFUNDED', { id: refund.value.refundId, links: [{ rel: 'up', href: captureUrl(captureId) }] }) })
    fixture.fake.reverseCapture(captureId)
    expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId: await fixture.delivered('PAYMENT.CAPTURE.REVERSED', { id: captureId }) })).toBe('applied')
    const returned = await refundsOf(rentalId)
    expect(returned.map((row) => row.amountCents)).toEqual([10_00, 25_00])
    expect(returned.reduce((total, row) => total + row.amountCents, 0)).toBeLessThanOrEqual(35_00)
  })
})
