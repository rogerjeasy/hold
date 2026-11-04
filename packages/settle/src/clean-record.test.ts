import { approveClaim, claimWorkspace, confirmCleanReturn, draftClaim, inShop, invoices, presentClaim, rentalOutcomes, rentals, renterTrustKey, replyToClaim, staffRoles } from '@hold/db'
import { addDays, fail } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { applyPayPalEvent, createMemoryScheduler, requestHoldPlacement, runExecution } from './index.ts'
import type { SettleDependencies } from './index.ts'
import { createSettleFixture } from './testing/settle-fixture.ts'

// The renter's Clean Record gains an outcome in the transaction that closes each rental (extensions.md section 7.4),
// whichever way its money was settled.

const NOW = new Date('2026-10-20T09:00:00Z')
const keyFor = (payerId: string) => `key-of-${payerId}`.padEnd(43, 'k')
let fixture: Awaited<ReturnType<typeof createSettleFixture>>
let userId: string
const dependencies = (): SettleDependencies => ({ database: fixture.database, paypalFor: () => fixture.fake, paypalMode: 'sandbox', send: () => Promise.resolve(), scheduler: createMemoryScheduler(), notifier: { tell: () => Promise.resolve() }, renterAsk: { approval: () => Promise.reject(new Error('Not used')) }, now: () => NOW })
const act = <Result>(work: Parameters<typeof fixture.inShop<Result>>[0]) => inShop(fixture.database, { role: 'hold_app', shopId: fixture.shopId, userId }, work)
const outcomeOf = async (rentalId: string) => (await fixture.database.select().from(rentalOutcomes).where(eq(rentalOutcomes.rentalId, rentalId)))[0]

// A rental back from its renter, with the hold placed and the renter's key kept as asking for the hold keeps it.
async function returned(): Promise<string> {
  const rental = await fixture.approvedHold(dependencies())
  const placement = await requestHoldPlacement(dependencies(), fixture.shopId, rental.rentalId)
  if (!placement.ok) throw new Error(placement.reason)
  await runExecution(dependencies(), { shopId: fixture.shopId, executionId: placement.executionId })
  await act((transaction) => renterTrustKey(transaction, rental.rentalId, keyFor))
  await fixture.database.update(rentals).set({ state: 'inspecting' }).where(eq(rentals.id, rental.rentalId))
  return rental.rentalId
}

async function acceptedClaim(rentalId: string): Promise<string> {
  const price = (await act((transaction) => claimWorkspace(transaction, rentalId)))?.prices[0]?.id ?? ''
  const drafted = await act((transaction) => draftClaim(transaction, rentalId, userId, [{ priceEntryId: price, reason: 'Scratch confirmed in person.' }], NOW))
  if (!drafted.ok) throw new Error(drafted.reason)
  await act((transaction) => approveClaim(transaction, drafted.claimId, userId, NOW))
  await act((transaction) => presentClaim(transaction, drafted.claimId, userId, NOW))
  const accepted = await act((transaction) => replyToClaim(transaction, rentalId, 'accept', '', NOW))
  if (!accepted.ok || accepted.executionId === null) throw new Error('No capture requested')
  return accepted.executionId
}

const declining = (): SettleDependencies => ({ ...dependencies(), paypalFor: () => ({ ...fixture.fake, captureFromHold: () => Promise.resolve(fail({ kind: 'declined' as const, issue: undefined, description: undefined, debugId: undefined })) }) })

beforeAll(async () => {
  fixture = await createSettleFixture(() => NOW)
  userId = (await fixture.inShop((transaction) => transaction.select().from(staffRoles)))[0]?.userId ?? ''
})

describe('closing a rental', () => {
  it('writes a clean outcome when the hold is released with no claim', async () => {
    const rentalId = await returned()
    const requested = await act((transaction) => confirmCleanReturn(transaction, rentalId, userId, 'Inspected in person: no new damage.', NOW))
    if (!requested.ok) throw new Error(requested.reason)
    await runExecution(dependencies(), { shopId: fixture.shopId, executionId: requested.executionId })
    expect(await outcomeOf(rentalId)).toMatchObject({ outcome: 'clean', counts: true, renterKey: keyFor('FAKEPAYER0001'), closedAt: NOW })
  })

  it('writes a settled outcome when a claim was taken from the hold', async () => {
    const rentalId = await returned()
    await runExecution(dependencies(), { shopId: fixture.shopId, executionId: await acceptedClaim(rentalId) })
    expect(await outcomeOf(rentalId)).toMatchObject({ outcome: 'settled' })
  })

  it('shows a decided claim open while its invoice waits, unpaid once due, and settled once paid', async () => {
    const rentalId = await returned()
    const executionId = await acceptedClaim(rentalId)
    // Declined twice: the first decline is tried once more before the invoice.
    await runExecution(declining(), { shopId: fixture.shopId, executionId })
    await runExecution(declining(), { shopId: fixture.shopId, executionId })
    expect(await outcomeOf(rentalId)).toMatchObject({ outcome: 'open', unpaidAfter: addDays(NOW, 30) })
    const bill = (await act((transaction) => transaction.select().from(invoices).where(eq(invoices.rentalId, rentalId))))[0]
    const paid: SettleDependencies = { ...dependencies(), paypalFor: () => ({ ...fixture.fake, invoiceClaim: async (input) => { const result = await fixture.fake.invoiceClaim(input); return result.ok ? { ...result, value: { ...result.value, status: 'paid' as const } } : result } }) }
    await applyPayPalEvent(paid, { shopId: fixture.shopId, eventId: await fixture.delivered('INVOICING.INVOICE.PAID', { id: bill?.paypalInvoiceId ?? '' }) })
    expect(await outcomeOf(rentalId)).toMatchObject({ outcome: 'settled', unpaidAfter: null })
  })
})

describe('a PayPal dispute', () => {
  it('leaves the renter’s record unchanged (X2.7)', async () => {
    const rentalId = await returned()
    const requested = await act((transaction) => confirmCleanReturn(transaction, rentalId, userId, 'Inspected in person: no new damage.', NOW))
    if (!requested.ok) throw new Error(requested.reason)
    await runExecution(dependencies(), { shopId: fixture.shopId, executionId: requested.executionId })
    const before = await fixture.database.select().from(rentalOutcomes)
    const eventId = await fixture.delivered('CUSTOMER.DISPUTE.CREATED', { id: 'PP-D-RECORD', disputed_transactions: [{ seller_transaction_id: rentalId }] })
    await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId })
    expect(await fixture.database.select().from(rentalOutcomes)).toEqual(before)
  })
})
