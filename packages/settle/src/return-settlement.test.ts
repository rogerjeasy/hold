import { approveClaim, confirmCleanReturn, draftClaim, inShop, presentClaim, replyToClaim, rentalDetail } from '@hold/db'
import { authorizations, executions, holds, moneyEvents, claimWorkspace, publishPriceList, receiptDeliveriesFor, rentals, staffRoles } from '@hold/db'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryScheduler, requestHoldPlacement, runExecution } from './index.ts'
import type { SettleDependencies } from './index.ts'
import { createSettleFixture } from './testing/settle-fixture.ts'

const NOW = new Date('2026-10-20T09:00:00Z')
let now = NOW
let fixture: Awaited<ReturnType<typeof createSettleFixture>>
let userId: string
const dependencies = (): SettleDependencies => ({ database: fixture.database, paypalFor: () => fixture.fake, paypalMode: 'sandbox', send: () => Promise.resolve(), scheduler: createMemoryScheduler(), notifier: { tell: () => Promise.resolve() }, renterAsk: { approval: () => Promise.reject(new Error('Not used')) }, now: () => now })
const act = <Result>(work: Parameters<typeof fixture.inShop<Result>>[0]) => inShop(fixture.database, { role: 'hold_app', shopId: fixture.shopId, userId }, work)

async function returned() {
  const rental = await fixture.approvedHold(dependencies())
  const placement = await requestHoldPlacement(dependencies(), fixture.shopId, rental.rentalId)
  if (!placement.ok) throw new Error(placement.reason)
  await runExecution(dependencies(), { shopId: fixture.shopId, executionId: placement.executionId })
  // Return evidence and comparisons have their own integration tests; this fixture starts at that boundary.
  await fixture.database.update(rentals).set({ state: 'inspecting' }).where(eq(rentals.id, rental.rentalId))
  return rental.rentalId
}
beforeAll(async () => {
  fixture = await createSettleFixture(() => now)
  userId = (await fixture.inShop((transaction) => transaction.select().from(staffRoles)))[0]?.userId ?? ''
})

beforeEach(async () => { now = NOW; await act((transaction) => publishPriceList(transaction, fixture.shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries: [{ description: 'Scratch', category: 'damage', amount: { cents: 3500, currency: 'EUR' } }], wearPolicy: 'Wear.' }, now)) })

describe('settling a returned rental', () => {
  it('confirms a staff-approved clean release and closes only after PayPal reads it voided', async () => {
    const rentalId = await returned()
    const requested = await act((transaction) => confirmCleanReturn(transaction, rentalId, userId, 'Inspected in person: no new damage.', NOW))
    if (!requested.ok) throw new Error(requested.reason)
    expect((await act((transaction) => rentalDetail(transaction, rentalId, NOW)))?.state).toBe('settling')
    expect(await act((transaction) => receiptDeliveriesFor(transaction, rentalId))).toEqual([])
    expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId: requested.executionId })).toBe('confirmed')
    expect((await act((transaction) => rentalDetail(transaction, rentalId, NOW)))?.state).toBe('closed')
    expect((await act((transaction) => transaction.select().from(holds).where(eq(holds.rentalId, rentalId))))[0]?.state).toBe('released')
    expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId: requested.executionId })).toBe('nothing_to_do')
    expect((await act((transaction) => transaction.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId)))).filter((row) => row.kind === 'hold_released').map((row) => row.amountCents)).toEqual([30000])
    expect(await act((transaction) => receiptDeliveriesFor(transaction, rentalId))).toMatchObject([{ kind: 'release', status: 'queued', amountCents: 30000, releasedCents: 30000 }])
  })
  it('takes only the accepted approved claim, releases the remainder and ignores duplicate work', async () => {
    const rentalId = await returned()
    const price = (await act((transaction) => claimWorkspace(transaction, rentalId)))?.prices[0]?.id ?? ''
    const drafted = await act((transaction) => draftClaim(transaction, rentalId, userId, [{ priceEntryId: price, reason: 'Scratch confirmed in person.' }], NOW))
    if (!drafted.ok) throw new Error(drafted.reason)
    await act((transaction) => approveClaim(transaction, drafted.claimId, userId, NOW))
    await act((transaction) => presentClaim(transaction, drafted.claimId, userId, NOW))
    const accepted = await act((transaction) => replyToClaim(transaction, rentalId, 'accept', '', NOW))
    expect(accepted).toMatchObject({ ok: true })
    if (!accepted.ok || accepted.executionId === null) throw new Error('No capture requested')
    expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId: accepted.executionId })).toBe('confirmed')
    expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId: accepted.executionId })).toBe('nothing_to_do')
    const events = await act((transaction) => transaction.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId)))
    expect(events.filter((row) => row.kind === 'hold_captured').map((row) => row.amountCents)).toEqual([3500])
    expect(events.filter((row) => row.kind === 'hold_released').map((row) => row.amountCents)).toEqual([26500])
    expect(await act((transaction) => receiptDeliveriesFor(transaction, rentalId))).toMatchObject([{ kind: 'capture', status: 'queued', amountCents: 3500, releasedCents: 26500 }])
    expect((await act((transaction) => rentalDetail(transaction, rentalId, NOW)))?.state).toBe('closed')
    expect((await act((transaction) => transaction.select().from(executions).where(eq(executions.id, accepted.executionId ?? ''))))[0]?.state).toBe('confirmed')
  })
})


// A claim accepted on day 4, after the hold's assured period, so charging it renews the hold first.
async function acceptedAfterAssuredPeriod() {
  const rentalId = await returned()
  const price = (await act((transaction) => claimWorkspace(transaction, rentalId)))?.prices[0]?.id ?? ''
  const drafted = await act((transaction) => draftClaim(transaction, rentalId, userId, [{ priceEntryId: price, reason: 'Confirmed scratch.' }], NOW))
  if (!drafted.ok) throw new Error(drafted.reason)
  await act((transaction) => approveClaim(transaction, drafted.claimId, userId, NOW))
  now = new Date(NOW.getTime() + 4 * 86400000)
  await act((transaction) => presentClaim(transaction, drafted.claimId, userId, now))
  const accepted = await act((transaction) => replyToClaim(transaction, rentalId, 'accept', '', now))
  if (!accepted.ok || accepted.executionId === null) throw new Error('No capture')
  return { rentalId, captureExecutionId: accepted.executionId }
}

it('renews through its own execution at charge time after the assured period', async () => {
  const { rentalId, captureExecutionId } = await acceptedAfterAssuredPeriod()
  expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId: captureExecutionId })).toBe('confirmed')
  expect((await act((transaction) => transaction.select().from(executions).where(eq(executions.rentalId, rentalId)))).filter((row) => row.action === 'renew').map((row) => row.state)).toEqual(['confirmed'])
  expect((await act((transaction) => transaction.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId)))).filter((row) => row.kind === 'hold_renewed')).toHaveLength(1)
})

// PayPal's sandbox, 28 October 2026 (tech-stack.md section 16, item 3): an original and its renewal share one life.
// Voiding the original voided the renewal too, and a final capture on the renewal left the original captured. So the
// renter's money is reserved once, and Hold must never void an original while its renewal is to be charged.
it('never voids the original authorization of a renewed hold, which would void the renewal with it', async () => {
  const { rentalId, captureExecutionId } = await acceptedAfterAssuredPeriod()
  expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId: captureExecutionId })).toBe('confirmed')
  const [hold] = await act((transaction) => transaction.select().from(holds).where(eq(holds.rentalId, rentalId)))
  const held = await act((transaction) => transaction.select().from(authorizations).where(eq(authorizations.holdId, hold?.id ?? '')))
  const original = held.find((row) => row.id === held.find((each) => each.renewedFromId !== null)?.renewedFromId)
  if (original === undefined) throw new Error('No original authorization')
  const queued = await act((transaction) => transaction.select().from(executions).where(eq(executions.rentalId, rentalId)))
  expect(queued.filter((row) => row.action === 'release' && row.paypalResourceIds['authorization'] === original.paypalAuthorizationId)).toEqual([])
})

it('falls back to a verified invoice on a refused capture and releases the authorization', async () => {
  const { fail } = await import('@hold/domain')
  const rentalId = await returned()
  const price = (await act((transaction) => claimWorkspace(transaction, rentalId)))?.prices[0]?.id ?? ''
  const drafted = await act((transaction) => draftClaim(transaction, rentalId, userId, [{ priceEntryId: price, reason: 'Verified scratch.' }], NOW))
  if (!drafted.ok) throw new Error(drafted.reason)
  await act((transaction) => approveClaim(transaction, drafted.claimId, userId, NOW))
  await act((transaction) => presentClaim(transaction, drafted.claimId, userId, NOW))
  const accepted = await act((transaction) => replyToClaim(transaction, rentalId, 'accept', '', NOW))
  if (!accepted.ok || accepted.executionId === null) throw new Error('No capture')
  const dependenciesWithDecline = { ...dependencies(), paypalFor: () => ({ ...fixture.fake, captureFromHold: () => Promise.resolve(fail({ kind: 'declined' as const, issue: undefined, description: undefined, debugId: undefined })) }) }
  await runExecution(dependenciesWithDecline, { shopId: fixture.shopId, executionId: accepted.executionId })
  const { invoices } = await import('@hold/db')
  expect((await act((transaction) => transaction.select().from(invoices).where(eq(invoices.rentalId, rentalId)))).map((row) => ({ state: row.state, amount: row.amountCents }))).toEqual([{ state: 'sent', amount: 3500 }])
  expect((await act((transaction) => transaction.select().from(holds).where(eq(holds.rentalId, rentalId))))[0]?.state).toBe('invoiced')
  expect((await act((transaction) => transaction.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId)))).filter((row) => row.kind === 'hold_captured')).toHaveLength(0)
  expect((await act((transaction) => receiptDeliveriesFor(transaction, rentalId))).map((receipt) => receipt.kind).sort()).toEqual(['invoice_sent', 'release'])
})

it('schedules the reply deadline and charges an unanswered approved claim once it ends', async () => {
  const { runClaimDeadline } = await import('./claim-deadline.ts')
  const rentalId = await returned()
  const price = (await act((transaction) => claimWorkspace(transaction, rentalId)))?.prices[0]?.id ?? ''
  const drafted = await act((transaction) => draftClaim(transaction, rentalId, userId, [{ priceEntryId: price, reason: 'Verified scratch.' }], NOW))
  if (!drafted.ok) throw new Error(drafted.reason)
  await act((transaction) => approveClaim(transaction, drafted.claimId, userId, NOW))
  const presented = await act((transaction) => presentClaim(transaction, drafted.claimId, userId, NOW))
  if (!presented.ok || presented.replyDueAt === null) throw new Error('No reply period')
  const scheduler = createMemoryScheduler()
  const dependenciesWithSchedule = { ...dependencies(), scheduler }
  expect(await runClaimDeadline(dependenciesWithSchedule, { kind: 'claim_plan', shopId: fixture.shopId, claimId: drafted.claimId })).toBe('claim_scheduled')
  expect(scheduler.scheduled()[0]?.at).toEqual(presented.replyDueAt)
  now = presented.replyDueAt
  expect(await runClaimDeadline(dependenciesWithSchedule, { kind: 'claim_due', shopId: fixture.shopId, claimId: drafted.claimId })).toBe('claim_charging')
  const capture = (await act((transaction) => transaction.select().from(executions).where(eq(executions.rentalId, rentalId)))).find((row) => row.action === 'capture')
  expect(capture).toBeDefined()
  expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId: capture?.id ?? '' })).toBe('confirmed')
})

it('protects an approved claim before expiry while preserving a later contest and verified refund', async () => {
  const { runClaimDeadline } = await import('./claim-deadline.ts')
  const { decideClaim } = await import('@hold/db')
  const rentalId = await returned()
  const price = (await act((transaction) => claimWorkspace(transaction, rentalId)))?.prices[0]?.id ?? ''
  const drafted = await act((transaction) => draftClaim(transaction, rentalId, userId, [{ priceEntryId: price, reason: 'Verified scratch.' }], NOW))
  if (!drafted.ok) throw new Error(drafted.reason)
  await act((transaction) => approveClaim(transaction, drafted.claimId, userId, NOW))
  now = new Date(NOW.getTime() + 28 * 86400000)
  await act((transaction) => presentClaim(transaction, drafted.claimId, userId, now))
  await runClaimDeadline(dependencies(), { kind: 'claim_due', shopId: fixture.shopId, claimId: drafted.claimId })
  const capture = (await act((transaction) => transaction.select().from(executions).where(eq(executions.rentalId, rentalId)))).find((row) => row.action === 'capture')
  if (capture === undefined) throw new Error('No protected capture')
  await runExecution(dependencies(), { shopId: fixture.shopId, executionId: capture.id })
  expect((await act((transaction) => rentalDetail(transaction, rentalId, now)))?.state).toBe('settling')
  expect(await act((transaction) => replyToClaim(transaction, rentalId, 'contest', 'The mark was already there.', now))).toMatchObject({ ok: true })
  const decision = await act((transaction) => decideClaim(transaction, drafted.claimId, userId, 'waive', 'The handover photograph confirms it was pre-existing.', now))
  if (!decision.ok) throw new Error(decision.reason)
  expect(await act((transaction) => decideClaim(transaction, drafted.claimId, userId, 'uphold', 'A later conflicting decision.', now))).toMatchObject({ ok: false, reason: 'decision_recorded' })
  expect((await act((transaction) => claimWorkspace(transaction, rentalId)))?.execution).toMatchObject({ action: 'refund', state: 'pending' })
  const pendingRefund: SettleDependencies = { ...dependencies(), paypalFor: () => ({ ...fixture.fake, refundCapture: async (input) => { const result = await fixture.fake.refundCapture(input); return result.ok ? { ...result, value: { ...result.value, status: 'pending' as const } } : result } }) }
  expect(await runExecution(pendingRefund, { shopId: fixture.shopId, executionId: decision.executionId })).toBe('waiting')
  expect((await act((transaction) => transaction.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId)))).filter((row) => row.kind === 'refunded')).toHaveLength(0)
  expect((await act((transaction) => receiptDeliveriesFor(transaction, rentalId))).some((receipt) => receipt.kind === 'refund')).toBe(false)
  const refund = (await act((transaction) => transaction.select().from(executions).where(eq(executions.id, decision.executionId))))[0]
  const delivered = await fixture.delivered('PAYMENT.CAPTURE.REFUNDED', { id: refund?.paypalResourceIds['refund'] ?? '' })
  const { applyPayPalEvent } = await import('./paypal-events.ts')
  const recoverRefund: SettleDependencies = { ...dependencies(), paypalFor: () => ({ ...fixture.fake, refundCapture: () => Promise.reject(new Error('A known refund must be read, never posted again')) }) }
  expect(await applyPayPalEvent(recoverRefund, { shopId: fixture.shopId, eventId: delivered })).toBe('applied')
  expect((await act((transaction) => transaction.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId)))).filter((row) => row.kind === 'refunded').map((row) => row.amountCents)).toEqual([3500])
  expect((await act((transaction) => receiptDeliveriesFor(transaction, rentalId))).filter((receipt) => receipt.kind === 'refund')).toMatchObject([{ amountCents: 3500, status: 'queued' }])
  expect((await act((transaction) => rentalDetail(transaction, rentalId, now)))?.state).toBe('closed')
})

it('recovers a pending capture only after a verified event and a fresh resource read', async () => {
  const { applyPayPalEvent } = await import('./paypal-events.ts')
  const rentalId = await returned()
  const price = (await act((transaction) => claimWorkspace(transaction, rentalId)))?.prices[0]?.id ?? ''
  const drafted = await act((transaction) => draftClaim(transaction, rentalId, userId, [{ priceEntryId: price, reason: 'Verified scratch.' }], NOW))
  if (!drafted.ok) throw new Error(drafted.reason)
  await act((transaction) => approveClaim(transaction, drafted.claimId, userId, NOW))
  await act((transaction) => presentClaim(transaction, drafted.claimId, userId, NOW))
  const accepted = await act((transaction) => replyToClaim(transaction, rentalId, 'accept', '', NOW))
  if (!accepted.ok || accepted.executionId === null) throw new Error('No capture')
  const pending = { ...dependencies(), paypalFor: () => ({ ...fixture.fake, readCapture: async (id: string) => { const result = await fixture.fake.readCapture(id); return result.ok ? { ...result, value: { ...result.value, status: 'pending' as const } } : result } }) }
  expect(await runExecution(pending, { shopId: fixture.shopId, executionId: accepted.executionId })).toBe('waiting')
  expect(await act((transaction) => receiptDeliveriesFor(transaction, rentalId))).toEqual([])
  expect((await act((transaction) => rentalDetail(transaction, rentalId, now)))?.state).toBe('settling')
  const execution = (await act((transaction) => transaction.select().from(executions).where(eq(executions.id, accepted.executionId ?? ''))))[0]
  const resource = { id: execution?.paypalResourceIds['capture'] ?? '' }
  const forged = await fixture.delivered('PAYMENT.CAPTURE.COMPLETED', resource, 'forged')
  expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId: forged })).toBe('rejected')
  expect(await act((transaction) => receiptDeliveriesFor(transaction, rentalId))).toEqual([])
  const delivered = await fixture.delivered('PAYMENT.CAPTURE.COMPLETED', resource)
  expect(await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId: delivered })).toBe('applied')
  expect((await act((transaction) => rentalDetail(transaction, rentalId, now)))?.state).toBe('closed')
})

it('records an invoice as paid only after the verified PayPal invoice event is read back', async () => {
  const { fail } = await import('@hold/domain')
  const { invoices } = await import('@hold/db')
  const { applyPayPalEvent } = await import('./paypal-events.ts')
  const rentalId = await returned()
  const price = (await act((transaction) => claimWorkspace(transaction, rentalId)))?.prices[0]?.id ?? ''
  const drafted = await act((transaction) => draftClaim(transaction, rentalId, userId, [{ priceEntryId: price, reason: 'Verified scratch.' }], NOW))
  if (!drafted.ok) throw new Error(drafted.reason)
  await act((transaction) => approveClaim(transaction, drafted.claimId, userId, NOW))
  await act((transaction) => presentClaim(transaction, drafted.claimId, userId, NOW))
  const accepted = await act((transaction) => replyToClaim(transaction, rentalId, 'accept', '', NOW))
  if (!accepted.ok || accepted.executionId === null) throw new Error('No capture')
  await runExecution({ ...dependencies(), paypalFor: () => ({ ...fixture.fake, captureFromHold: () => Promise.resolve(fail({ kind: 'declined' as const, issue: undefined, description: undefined, debugId: undefined })) }) }, { shopId: fixture.shopId, executionId: accepted.executionId })
  const bill = (await act((transaction) => transaction.select().from(invoices).where(eq(invoices.rentalId, rentalId))))[0]
  const delivered = await fixture.delivered('INVOICING.INVOICE.PAID', { id: bill?.paypalInvoiceId ?? '' })
  const paid: SettleDependencies = { ...dependencies(), paypalFor: () => ({ ...fixture.fake, invoiceClaim: async (input) => { const result = await fixture.fake.invoiceClaim(input); return result.ok ? { ...result, value: { ...result.value, status: 'paid' as const } } : result } }) }
  await applyPayPalEvent(paid, { shopId: fixture.shopId, eventId: delivered })
  expect((await act((transaction) => transaction.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId)))).filter((event) => event.kind === 'invoice_paid').map((event) => event.amountCents)).toEqual([3500])
  expect((await act((transaction) => receiptDeliveriesFor(transaction, rentalId))).filter((receipt) => receipt.kind === 'invoice_paid')).toMatchObject([{ amountCents: 3500, status: 'queued' }])
  expect((await act((transaction) => rentalDetail(transaction, rentalId, now)))?.state).toBe('closed')
})

it('rechecks the execution amount against the approved claim before calling PayPal', async () => {
  const rentalId = await returned()
  const price = (await act((transaction) => claimWorkspace(transaction, rentalId)))?.prices[0]?.id ?? ''
  const drafted = await act((transaction) => draftClaim(transaction, rentalId, userId, [{ priceEntryId: price, reason: 'Verified scratch.' }], NOW))
  if (!drafted.ok) throw new Error(drafted.reason)
  await act((transaction) => approveClaim(transaction, drafted.claimId, userId, NOW))
  await act((transaction) => presentClaim(transaction, drafted.claimId, userId, NOW))
  const accepted = await act((transaction) => replyToClaim(transaction, rentalId, 'accept', '', NOW))
  if (!accepted.ok || accepted.executionId === null) throw new Error('No capture')
  const [execution] = await fixture.database.update(executions).set({ amountCents: 4000 }).where(eq(executions.id, accepted.executionId)).returning()
  await runExecution(dependencies(), { shopId: fixture.shopId, executionId: accepted.executionId })
  expect(await fixture.fake.readAuthorization(execution?.paypalResourceIds['authorization'] ?? '')).toMatchObject({ ok: true, value: { status: 'created' } })
})


it('closes an unanswered protected claim when the original reply period ends', async () => {
  const { runClaimDeadline } = await import('./claim-deadline.ts')
  const rentalId = await returned()
  const price = (await act((transaction) => claimWorkspace(transaction, rentalId)))?.prices[0]?.id ?? ''
  const drafted = await act((transaction) => draftClaim(transaction, rentalId, userId, [{ priceEntryId: price, reason: 'Verified scratch.' }], NOW))
  if (!drafted.ok) throw new Error(drafted.reason)
  await act((transaction) => approveClaim(transaction, drafted.claimId, userId, NOW))
  now = new Date(NOW.getTime() + 28 * 86400000)
  const presented = await act((transaction) => presentClaim(transaction, drafted.claimId, userId, now))
  if (!presented.ok || presented.replyDueAt === null) throw new Error('No reply deadline')
  await runClaimDeadline(dependencies(), { kind: 'claim_due', shopId: fixture.shopId, claimId: drafted.claimId })
  const capture = (await act((transaction) => transaction.select().from(executions).where(eq(executions.rentalId, rentalId)))).find((row) => row.action === 'capture')
  if (capture === undefined) throw new Error('No protective capture')
  await runExecution(dependencies(), { shopId: fixture.shopId, executionId: capture.id })
  now = presented.replyDueAt
  await runClaimDeadline(dependencies(), { kind: 'claim_due', shopId: fixture.shopId, claimId: drafted.claimId })
  expect((await act((transaction) => rentalDetail(transaction, rentalId, now)))?.state).toBe('closed')
})

async function protectedAboveReserve() {
  await act((transaction) => publishPriceList(transaction, fixture.shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries: [{ description: 'Replacement', category: 'damage', amount: { cents: 35000, currency: 'EUR' } }], wearPolicy: 'Wear.' }, now))
  const rentalId = await returned()
  const price = (await act((transaction) => claimWorkspace(transaction, rentalId)))?.prices[0]?.id ?? ''
  const claim = await act((transaction) => draftClaim(transaction, rentalId, userId, [{ priceEntryId: price, reason: 'Replacement confirmed by inspection.' }], NOW))
  if (!claim.ok) throw new Error(claim.reason)
  await act((transaction) => approveClaim(transaction, claim.claimId, userId, NOW))
  now = new Date(NOW.getTime() + 28 * 86400000)
  await act((transaction) => presentClaim(transaction, claim.claimId, userId, now))
  const { runClaimDeadline } = await import('./claim-deadline.ts')
  await runClaimDeadline(dependencies(), { kind: 'claim_due', shopId: fixture.shopId, claimId: claim.claimId })
  const capture = (await act((transaction) => transaction.select().from(executions).where(eq(executions.rentalId, rentalId)))).find((row) => row.action === 'capture')
  if (capture === undefined) throw new Error('No capture')
  await runExecution(dependencies(), { shopId: fixture.shopId, executionId: capture.id })
  return { rentalId, claimId: claim.claimId, captureId: capture.id }
}
it('defers the excess invoice on a protective capture until the original reply is resolved', async () => {
  const rental = await protectedAboveReserve()
  const { invoices } = await import('@hold/db')
  expect(await act((transaction) => transaction.select().from(invoices).where(eq(invoices.rentalId, rental.rentalId)))).toHaveLength(0)
  await act((transaction) => replyToClaim(transaction, rental.rentalId, 'accept', '', now))
  expect((await act((transaction) => rentalDetail(transaction, rental.rentalId, now)))?.state).toBe('settling')
  const bill = (await act((transaction) => transaction.select().from(invoices).where(eq(invoices.rentalId, rental.rentalId))))[0]
  expect(bill?.amountCents).toBe(5000)
})
it('waives a protective claim by refunding its capture without leaving an excess invoice collectible', async () => {
  const rental = await protectedAboveReserve()
  const { decideClaim, invoices } = await import('@hold/db')
  await act((transaction) => replyToClaim(transaction, rental.rentalId, 'contest', 'I contest this replacement.', now))
  const decision = await act((transaction) => decideClaim(transaction, rental.claimId, userId, 'waive', 'The damage predates the rental.', now))
  if (!decision.ok) throw new Error(decision.reason)
  await runExecution(dependencies(), { shopId: fixture.shopId, executionId: decision.executionId })
  expect(await act((transaction) => transaction.select().from(invoices).where(eq(invoices.rentalId, rental.rentalId)))).toHaveLength(0)
  expect((await act((transaction) => claimWorkspace(transaction, rental.rentalId)))?.amounts).toMatchObject({ capture: { cents: 0 }, invoice: { cents: 0 } })
  expect((await act((transaction) => rentalDetail(transaction, rental.rentalId, now)))?.state).toBe('closed')
})

async function acceptedClaim(beforeReply?: (rentalId: string) => Promise<void>) {
  const rentalId = await returned()
  const price = (await act((transaction) => claimWorkspace(transaction, rentalId)))?.prices[0]?.id ?? ''
  const drafted = await act((transaction) => draftClaim(transaction, rentalId, userId, [{ priceEntryId: price, reason: 'Verified scratch.' }], NOW))
  if (!drafted.ok) throw new Error(drafted.reason)
  await act((transaction) => approveClaim(transaction, drafted.claimId, userId, NOW))
  await act((transaction) => presentClaim(transaction, drafted.claimId, userId, now))
  await beforeReply?.(rentalId)
  const accepted = await act((transaction) => replyToClaim(transaction, rentalId, 'accept', '', now))
  if (!accepted.ok || accepted.executionId === null) throw new Error('No capture')
  return { rentalId, claimId: drafted.claimId, executionId: accepted.executionId }
}

it('falls back to an invoice when a pending capture is later declined', async () => {
  const { ok } = await import('@hold/domain')
  const { invoices } = await import('@hold/db')
  const rental = await acceptedClaim()
  const execution = (await act((transaction) => transaction.select().from(executions).where(eq(executions.id, rental.executionId))))[0]
  const authorizationId = execution?.paypalResourceIds['authorization'] ?? ''
  let status: 'pending' | 'declined' = 'pending'
  const read = () => Promise.resolve(ok({ captureId: 'PENDING-DECLINED', authorizationId, status, amount: { cents: 3500, currency: 'EUR' }, finalCapture: true, createdAt: now }))
  const pending: SettleDependencies = { ...dependencies(), paypalFor: () => ({ ...fixture.fake, captureFromHold: read, readCapture: read }) }
  expect(await runExecution(pending, { shopId: fixture.shopId, executionId: rental.executionId })).toBe('waiting')
  status = 'declined'
  await runExecution(pending, { shopId: fixture.shopId, executionId: rental.executionId })
  expect((await act((transaction) => transaction.select().from(invoices).where(eq(invoices.rentalId, rental.rentalId)))).map((row) => row.state)).toEqual(['sent'])
})

it('invoices an accepted claim after the authorization has expired without trying to capture it', async () => {
  const { rentalHold, invoices } = await import('@hold/db')
  const rentalId = await returned()
  const price = (await act((transaction) => claimWorkspace(transaction, rentalId)))?.prices[0]?.id ?? ''
  const drafted = await act((transaction) => draftClaim(transaction, rentalId, userId, [{ priceEntryId: price, reason: 'Verified scratch.' }], NOW))
  if (!drafted.ok) throw new Error(drafted.reason)
  await act((transaction) => approveClaim(transaction, drafted.claimId, userId, NOW))
  now = new Date(NOW.getTime() + 30 * 86400000)
  const hold = await act((transaction) => rentalHold(transaction, rentalId))
  if (hold?.paypalAuthorizationId == null) throw new Error('No hold')
  // The hold-expiry worker has confirmed this terminal state from PayPal.
  await fixture.database.update(holds).set({ state: 'expired' }).where(eq(holds.rentalId, rentalId))
  await act((transaction) => presentClaim(transaction, drafted.claimId, userId, now))
  const reply = await act((transaction) => replyToClaim(transaction, rentalId, 'accept', '', now))
  expect(reply.ok).toBe(true)
  if (!reply.ok || reply.executionId === null) throw new Error('No invoice execution')
  const expired: SettleDependencies = { ...dependencies(), paypalFor: () => ({ ...fixture.fake, captureFromHold: () => Promise.reject(new Error('Expired authorizations must not be captured')), readAuthorization: async (id) => { const read = await fixture.fake.readAuthorization(id); return read.ok ? { ...read, value: { ...read.value, status: 'expired' as const } } : read } }) }
  await runExecution(expired, { shopId: fixture.shopId, executionId: reply.executionId })
  expect((await act((transaction) => transaction.select().from(invoices).where(eq(invoices.rentalId, rentalId)))).map((row) => row.state)).toEqual(['sent'])
  expect((await act((transaction) => rentalHold(transaction, rentalId)))?.state).toBe('expired')
  expect((await act((transaction) => claimWorkspace(transaction, rentalId)))?.amounts).toMatchObject({ capture: { cents: 0 }, invoice: { cents: 3500 } })
})

it('allows an independent decision to waive a failed protective capture and releases the hold', async () => {
  const { fail } = await import('@hold/domain')
  const { decideClaim, invoices } = await import('@hold/db')
  const { runClaimDeadline } = await import('./claim-deadline.ts')
  const rentalId = await returned()
  const price = (await act((transaction) => claimWorkspace(transaction, rentalId)))?.prices[0]?.id ?? ''
  const claim = await act((transaction) => draftClaim(transaction, rentalId, userId, [{ priceEntryId: price, reason: 'Verified scratch.' }], NOW))
  if (!claim.ok) throw new Error(claim.reason)
  await act((transaction) => approveClaim(transaction, claim.claimId, userId, NOW))
  now = new Date(NOW.getTime() + 28 * 86400000)
  await act((transaction) => presentClaim(transaction, claim.claimId, userId, now))
  await runClaimDeadline(dependencies(), { kind: 'claim_due', shopId: fixture.shopId, claimId: claim.claimId })
  const capture = (await act((transaction) => transaction.select().from(executions).where(eq(executions.rentalId, rentalId)))).find((row) => row.action === 'capture')
  if (capture === undefined) throw new Error('No capture')
  await runExecution({ ...dependencies(), paypalFor: () => ({ ...fixture.fake, captureFromHold: () => Promise.resolve(fail({ kind: 'declined' as const, issue: undefined, description: undefined, debugId: undefined })) }) }, { shopId: fixture.shopId, executionId: capture.id })
  expect(await act((transaction) => replyToClaim(transaction, rentalId, 'contest', 'Pre-existing mark.', now))).toMatchObject({ ok: true })
  const waived = await act((transaction) => decideClaim(transaction, claim.claimId, userId, 'waive', 'Confirmed pre-existing.', now))
  if (!waived.ok) throw new Error(waived.reason)
  await runExecution(dependencies(), { shopId: fixture.shopId, executionId: waived.executionId })
  expect((await act((transaction) => rentalDetail(transaction, rentalId, now)))?.state).toBe('closed')
  expect(await act((transaction) => transaction.select().from(invoices).where(eq(invoices.rentalId, rentalId)))).toHaveLength(0)
})


it('fences settlement against a late replacement approval and waits for both its release and excess invoice payment', async () => {
  await act((transaction) => publishPriceList(transaction, fixture.shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries: [{ description: 'Replacement', category: 'damage', amount: { cents: 35000, currency: 'EUR' } }], wearPolicy: 'Wear.' }, now))
  const { beginHoldPlacement, confirmHoldPlaced, saveReplacementOrder, authorizations } = await import('@hold/db')
  let orderId = ''
  const rental = await acceptedClaim(async (rentalId) => {
    const [hold] = await act((transaction) => transaction.select().from(holds).where(eq(holds.rentalId, rentalId)))
    if (hold?.currentAuthorizationId == null) throw new Error('No hold')
    const order = await fixture.fake.createHoldOrder({ amount: { cents: 30000, currency: 'EUR' }, rentalReference: rentalId, description: 'Replacement', returnUrl: 'https://hold.test/return', cancelUrl: 'https://hold.test/cancel', idempotencyKey: `replacement-${rentalId}` })
    if (!order.ok) throw new Error(order.error.kind)
    orderId = order.value.orderId
    fixture.fake.approveOrder(orderId)
    await act((transaction) => saveReplacementOrder(transaction, hold.id, hold.currentAuthorizationId ?? '', orderId))
  })
  const [capture] = await act((transaction) => transaction.select().from(executions).where(eq(executions.id, rental.executionId)))
  const original = capture?.paypalResourceIds['authorization']
  const racing: SettleDependencies = { ...dependencies(), paypalFor: () => ({ ...fixture.fake, captureFromHold: async (input) => {
    const placed = await fixture.fake.placeHold({ orderId, idempotencyKey: `late-${orderId}` })
    const begun = await act((transaction) => beginHoldPlacement(transaction, rental.rentalId, now, { confirming: true, orderId }))
    if (!placed.ok || !begun.ok) throw new Error('No replacement')
    await act((transaction) => confirmHoldPlaced(transaction, begun.execution.id, placed.value, now))
    return fixture.fake.captureFromHold(input)
  } }) }
  await runExecution(racing, { shopId: fixture.shopId, executionId: rental.executionId })
  const rows = await act((transaction) => transaction.select().from(authorizations))
  const [hold] = await act((transaction) => transaction.select().from(holds).where(eq(holds.rentalId, rental.rentalId)))
  expect(rows.find((row) => row.id === hold?.currentAuthorizationId)?.paypalAuthorizationId).toBe(original)
  expect(rows.filter((row) => row.holdId === hold?.id && row.state === 'captured').map((row) => row.paypalAuthorizationId)).toEqual([original])
  expect((await act((transaction) => rentalDetail(transaction, rental.rentalId, now)))?.state).toBe('settling')
  const releases = (await act((transaction) => transaction.select().from(executions).where(eq(executions.rentalId, rental.rentalId)))).filter((row) => row.action === 'release')
  expect(releases).toHaveLength(1)
  const release = releases[0]
  if (release === undefined) throw new Error('No unused authorization release')
  await runExecution(dependencies(), { shopId: fixture.shopId, executionId: release.id })
  expect((await act((transaction) => rentalDetail(transaction, rental.rentalId, now)))?.state).toBe('settling')
  const { invoices } = await import('@hold/db')
  const bill = (await act((transaction) => transaction.select().from(invoices).where(eq(invoices.rentalId, rental.rentalId))))[0]
  const eventId = await fixture.delivered('INVOICING.INVOICE.PAID', { id: bill?.paypalInvoiceId ?? '' })
  const paid: SettleDependencies = { ...dependencies(), paypalFor: () => ({ ...fixture.fake, invoiceClaim: async (input) => { const result = await fixture.fake.invoiceClaim(input); return result.ok ? { ...result, value: { ...result.value, status: 'paid' as const } } : result } }) }
  const { applyPayPalEvent } = await import('./paypal-events.ts')
  await applyPayPalEvent(paid, { shopId: fixture.shopId, eventId })
  expect((await act((transaction) => rentalDetail(transaction, rental.rentalId, now)))?.state).toBe('closed')
})


it('recreates the original reply deadline after scheduling fails following a protective capture request', async () => {
  const { runClaimDeadline } = await import('./claim-deadline.ts')
  const rentalId = await returned()
  const price = (await act((transaction) => claimWorkspace(transaction, rentalId)))?.prices[0]?.id ?? ''
  const drafted = await act((transaction) => draftClaim(transaction, rentalId, userId, [{ priceEntryId: price, reason: 'Verified scratch.' }], now))
  if (!drafted.ok) throw new Error(drafted.reason)
  await act((transaction) => approveClaim(transaction, drafted.claimId, userId, now))
  now = new Date(NOW.getTime() + 28 * 86400000)
  await act((transaction) => presentClaim(transaction, drafted.claimId, userId, now))
  const unavailable: SettleDependencies = { ...dependencies(), scheduler: { ...createMemoryScheduler(), at: () => Promise.reject(new Error('Scheduler unavailable')) } }
  const message = { kind: 'claim_due', shopId: fixture.shopId, claimId: drafted.claimId } as const
  await expect(runClaimDeadline(unavailable, message)).rejects.toThrow('Scheduler unavailable')
  const scheduler = createMemoryScheduler()
  await runClaimDeadline({ ...dependencies(), scheduler }, message)
  expect(scheduler.scheduled().map((schedule) => schedule.name)).toContain(`claim-reply-close-${drafted.claimId}`)
})
