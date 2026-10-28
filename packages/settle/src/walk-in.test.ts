import { approveClaim, authorizations, claimWorkspace, confirmCleanReturn, draftClaim, executions, holds, moneyEvents, presentClaim, publishPriceList, rentals, replyToClaim, staffRoles } from '@hold/db'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, expect, it } from 'vitest'
import { createMemoryScheduler, requestHoldPlacement, runExecution } from './index.ts'
import type { SettleDependencies } from './index.ts'
import { createSettleFixture, FEE, HOLD } from './testing/settle-fixture.ts'

// A walk-in staff let approve the fee and the hold once (architecture.md section 8.2): one authorization for both, the
// fee captured from it at once as a capture that is not the final one, the rest held. PayPal's sandbox confirmed each
// step on 14 and 28 October 2026 (tech-stack.md section 16, items 2 and 3).

const NOW = new Date('2026-10-20T09:00:00Z')
let now = NOW
let fixture: Awaited<ReturnType<typeof createSettleFixture>>
let userId: string
const dependencies = (): SettleDependencies => ({ database: fixture.database, paypalFor: () => fixture.fake, paypalMode: 'sandbox', send: () => Promise.resolve(), scheduler: createMemoryScheduler(), notifier: { tell: () => Promise.resolve() }, renterAsk: { approval: () => Promise.reject(new Error('Not used')) }, now: () => now })
const rowsOf = async (rentalId: string) => fixture.inShop(async (transaction) => ({
  rental: (await transaction.select().from(rentals).where(eq(rentals.id, rentalId)))[0],
  hold: (await transaction.select().from(holds).where(eq(holds.rentalId, rentalId)))[0],
  executions: await transaction.select().from(executions).where(eq(executions.rentalId, rentalId)),
  money: await transaction.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId)),
}))
const paypalAuthorizationOf = async (rentalId: string) => {
  const { hold } = await rowsOf(rentalId)
  const [current] = await fixture.inShop((transaction) => transaction.select().from(authorizations).where(eq(authorizations.id, hold?.currentAuthorizationId ?? '')))
  return current?.paypalAuthorizationId ?? ''
}

// Placed and its fee captured, as the worker does once the renter is back from PayPal.
async function readyWalkIn() {
  const { rentalId, orderId } = await fixture.approvedWalkIn()
  const placement = await requestHoldPlacement(dependencies(), fixture.shopId, rentalId)
  if (!placement.ok) throw new Error(placement.reason)
  expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId: placement.executionId })).toBe('confirmed')
  const fee = (await rowsOf(rentalId)).executions.find((row) => row.idempotencyKey === `fee-capture-${rentalId}-${orderId}`)
  if (fee === undefined) throw new Error('No fee capture was queued.')
  expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId: fee.id })).toBe('confirmed')
  return rentalId
}

beforeAll(async () => {
  fixture = await createSettleFixture(() => now)
  userId = (await fixture.inShop((transaction) => transaction.select().from(staffRoles)))[0]?.userId ?? ''
})

beforeEach(async () => { now = NOW; await fixture.inShop((transaction) => publishPriceList(transaction, fixture.shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries: [{ description: 'Scratch', category: 'damage', amount: { cents: 3500, currency: 'EUR' } }], wearPolicy: 'Wear.' }, now)) })

it('captures a walk-in’s fee from their one authorization, keeps the rest held, and makes the rental ready', async () => {
  const rentalId = await readyWalkIn()
  const { rental, hold, money } = await rowsOf(rentalId)
  expect(rental).toMatchObject({ state: 'ready', paypalFeeOrderId: null })
  expect(rental?.renterId).not.toBeNull()
  expect(hold).toMatchObject({ state: 'placed', strategy: 'combined', reservedCents: HOLD })
  expect(money.map((row) => [row.kind, row.amountCents])).toEqual(expect.arrayContaining([['hold_placed', FEE + HOLD], ['fee_captured', FEE]]))
  const read = await fixture.fake.readAuthorization(await paypalAuthorizationOf(rentalId))
  expect(read.ok && read.value.status).toBe('partially_captured')
})

it('releases what is still held after a clean return, and the fee stays taken', async () => {
  const rentalId = await readyWalkIn()
  await fixture.database.update(rentals).set({ state: 'inspecting' }).where(eq(rentals.id, rentalId))
  const released = await fixture.inShop((transaction) => confirmCleanReturn(transaction, rentalId, userId, 'Inspected in person: no new damage.', now))
  if (!released.ok) throw new Error(released.reason)
  expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId: released.executionId })).toBe('confirmed')
  const read = await fixture.fake.readAuthorization(await paypalAuthorizationOf(rentalId))
  expect(read.ok && read.value.status).toBe('voided')
  expect((await rowsOf(rentalId)).money.filter((row) => row.kind === 'fee_captured').map((row) => row.amountCents)).toEqual([FEE])
})

// The renewal names the amount still held: one with no amount asks for fee and hold, which PayPal refused once the fee
// was captured (tech-stack.md section 16, item 3).
it('renews a walk-in’s hold for what is still held when it charges after day 3, and takes the claim from the renewal', async () => {
  const rentalId = await readyWalkIn()
  await fixture.database.update(rentals).set({ state: 'inspecting' }).where(eq(rentals.id, rentalId))
  const price = (await fixture.inShop((transaction) => claimWorkspace(transaction, rentalId)))?.prices[0]?.id ?? ''
  const drafted = await fixture.inShop((transaction) => draftClaim(transaction, rentalId, userId, [{ priceEntryId: price, reason: 'Confirmed scratch.' }], now))
  if (!drafted.ok) throw new Error(drafted.reason)
  await fixture.inShop((transaction) => approveClaim(transaction, drafted.claimId, userId, now))
  now = new Date(NOW.getTime() + 4 * 86_400_000)
  await fixture.inShop((transaction) => presentClaim(transaction, drafted.claimId, userId, now))
  const accepted = await fixture.inShop((transaction) => replyToClaim(transaction, rentalId, 'accept', '', now))
  if (!accepted.ok || accepted.executionId === null) throw new Error('No capture')
  expect(await runExecution(dependencies(), { shopId: fixture.shopId, executionId: accepted.executionId })).toBe('confirmed')
  const { executions: rows, money } = await rowsOf(rentalId)
  expect(rows.filter((row) => row.action === 'renew').map((row) => [row.state, row.amountCents])).toEqual([['confirmed', HOLD]])
  expect(money.filter((row) => row.kind === 'hold_renewed').map((row) => row.amountCents)).toEqual([HOLD])
  expect(money.filter((row) => row.kind === 'hold_captured').map((row) => row.amountCents)).toEqual([35_00])
  const renewal = await fixture.fake.readAuthorization(await paypalAuthorizationOf(rentalId))
  expect(renewal.ok && renewal.value).toMatchObject({ status: 'captured', amount: { cents: HOLD } })
})

it('never captures more than is still held, however large the claim', async () => {
  const rentalId = await readyWalkIn()
  const read = await fixture.fake.readAuthorization(await paypalAuthorizationOf(rentalId))
  if (!read.ok) throw new Error(read.error.kind)
  const tooMuch = await fixture.fake.captureFromHold({ authorizationId: read.value.authorizationId, amount: { cents: HOLD + 1, currency: 'EUR' }, finalCapture: true, idempotencyKey: `too-much-${rentalId}` })
  expect(tooMuch.ok ? 'captured' : tooMuch.error.kind).toBe('amount_exceeds_hold')
})
