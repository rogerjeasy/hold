import { approveClaim, claimWorkspace, draftClaim, executions, inShop, presentClaim, publishPriceList, rentalDetail, rentals, replyToClaim, staffRoles } from '@hold/db'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryScheduler, EXECUTION_RECHECK_MINUTES, recheckWaitingExecutions, requestHoldPlacement, runExecution } from './index.ts'
import type { QueueMessage, SettleDependencies } from './index.ts'
import { createSettleFixture } from './testing/settle-fixture.ts'

// A money execution PayPal answered "not yet" is read back from PayPal again on a timer, not only when a webhook comes
// (architecture.md section 7.6). Re-running it repeats nothing PayPal already did and moves no state backwards.

const NOW = new Date('2026-10-20T09:00:00Z')
const minutes = (count: number) => new Date(NOW.getTime() + count * 60_000)
let now = NOW
let fixture: Awaited<ReturnType<typeof createSettleFixture>>
let userId: string
let sent: QueueMessage[] = []
let captures = 0

const dependencies = (paypal: 'pending' | 'completed' = 'completed'): SettleDependencies => ({
  database: fixture.database,
  paypalFor: () => ({
    ...fixture.fake,
    captureFromHold: (input) => { captures += 1; return fixture.fake.captureFromHold(input) },
    readCapture: async (id: string) => {
      const result = await fixture.fake.readCapture(id)
      return result.ok && paypal === 'pending' ? { ...result, value: { ...result.value, status: 'pending' as const } } : result
    },
  }),
  paypalMode: 'sandbox',
  send: (message) => { sent.push(message); return Promise.resolve() },
  scheduler: createMemoryScheduler(),
  notifier: { tell: () => Promise.resolve() },
  renterAsk: { approval: () => Promise.reject(new Error('Not used')) },
  now: () => now,
})
const act = <Result>(work: Parameters<typeof fixture.inShop<Result>>[0]) => inShop(fixture.database, { role: 'hold_app', shopId: fixture.shopId, userId }, work)

// A returned rental whose renter accepted a claim, with the capture PayPal is still processing.
async function waitingCapture() {
  const rental = await fixture.approvedHold(dependencies())
  const placement = await requestHoldPlacement(dependencies(), fixture.shopId, rental.rentalId)
  if (!placement.ok) throw new Error(placement.reason)
  await runExecution(dependencies(), { shopId: fixture.shopId, executionId: placement.executionId })
  await fixture.database.update(rentals).set({ state: 'inspecting' }).where(eq(rentals.id, rental.rentalId))
  const price = (await act((transaction) => claimWorkspace(transaction, rental.rentalId)))?.prices[0]?.id ?? ''
  const drafted = await act((transaction) => draftClaim(transaction, rental.rentalId, userId, [{ priceEntryId: price, reason: 'Verified scratch.' }], now))
  if (!drafted.ok) throw new Error(drafted.reason)
  await act((transaction) => approveClaim(transaction, drafted.claimId, userId, now))
  await act((transaction) => presentClaim(transaction, drafted.claimId, userId, now))
  const accepted = await act((transaction) => replyToClaim(transaction, rental.rentalId, 'accept', '', now))
  if (!accepted.ok || accepted.executionId === null) throw new Error('No capture')
  expect(await runExecution(dependencies('pending'), { shopId: fixture.shopId, executionId: accepted.executionId })).toBe('waiting')
  // Only what the re-check sends is looked at, not what building the rental sent.
  sent = []
  return { rentalId: rental.rentalId, executionId: accepted.executionId }
}
const stateOf = async (executionId: string) => (await fixture.database.select({ state: executions.state }).from(executions).where(eq(executions.id, executionId)))[0]?.state

beforeAll(async () => {
  fixture = await createSettleFixture(() => now)
  userId = (await fixture.inShop((transaction) => transaction.select().from(staffRoles)))[0]?.userId ?? ''
})

beforeEach(async () => {
  now = NOW
  sent = []
  captures = 0
  await act((transaction) => publishPriceList(transaction, fixture.shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries: [{ description: 'Scratch', category: 'damage', amount: { cents: 3500, currency: 'EUR' } }], wearPolicy: 'Wear.' }, now))
})

describe('re-checking a money execution PayPal left waiting', () => {
  it('sends it to the worker again once it has waited a quarter of an hour, not before, and not again at once', async () => {
    const { rentalId, executionId } = await waitingCapture()
    expect(EXECUTION_RECHECK_MINUTES).toBe(15)
    now = minutes(10)
    expect(await recheckWaitingExecutions(dependencies(), 50)).toBe(0)
    now = minutes(16)
    expect(await recheckWaitingExecutions(dependencies(), 50)).toBe(1)
    expect(sent).toEqual([expect.objectContaining({ group: rentalId, body: { shopId: fixture.shopId, executionId } })])
    // Its own deduplication id, so the queue does not drop it as the first send's twin.
    expect(sent[0]?.deduplicationId).not.toBe(`execution-${executionId}`)
    expect(await recheckWaitingExecutions(dependencies(), 50)).toBe(0)
    now = minutes(32)
    expect(await recheckWaitingExecutions(dependencies(), 50)).toBe(1)
  })

  it('finishes from PayPal\'s record when the worker runs it again, and never captures twice', async () => {
    const { rentalId, executionId } = await waitingCapture()
    expect(captures).toBe(1)
    now = minutes(16)
    await recheckWaitingExecutions(dependencies(), 50)
    const message = sent.find((each) => each.body['executionId'] === executionId)
    expect(message).toBeDefined()
    expect(await runExecution(dependencies('completed'), { shopId: fixture.shopId, executionId })).toBe('confirmed')
    expect(captures).toBe(1)
    expect(await stateOf(executionId)).toBe('confirmed')
    expect((await act((transaction) => rentalDetail(transaction, rentalId, now)))?.state).toBe('closed')
  })

  it('never sends a confirmed or failed execution again, so nothing moves backwards', async () => {
    const { executionId } = await waitingCapture()
    await runExecution(dependencies('completed'), { shopId: fixture.shopId, executionId })
    expect(await stateOf(executionId)).toBe('confirmed')
    now = minutes(60 * 24)
    await recheckWaitingExecutions(dependencies(), 50)
    expect(sent.filter((each) => each.body['executionId'] === executionId)).toEqual([])
    expect(await runExecution(dependencies('pending'), { shopId: fixture.shopId, executionId })).toBe('nothing_to_do')
    expect(await stateOf(executionId)).toBe('confirmed')
  })
})
