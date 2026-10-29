import { approveClaim, claims, draftClaim, grantStandingRule, holds, inShop, claimWorkspace, presentClaim, publishPriceList, rentals, replyToClaim, staffRoles } from '@hold/db'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryScheduler, executionMessageSchema, requestHoldPlacement, runExecution, runUpkeep } from './index.ts'
import type { MemoryScheduler, Notice, SettleDependencies } from './index.ts'
import { createSettleFixture } from './testing/settle-fixture.ts'

// The shop's promise to decide a contested claim (architecture.md section 6.16), kept by the upkeep queue.
const NOW = new Date('2026-10-20T09:00:00Z')
let now = NOW
let fixture: Awaited<ReturnType<typeof createSettleFixture>>
let userId: string
let scheduler: MemoryScheduler
let notices: Notice[]

const dependencies = (): SettleDependencies => ({
  database: fixture.database,
  paypalFor: () => fixture.fake,
  paypalMode: 'sandbox',
  send: async (message) => {
    if (message.queue === 'executions') await runExecution(dependencies(), executionMessageSchema.parse(message.body))
  },
  scheduler,
  notifier: { tell: (notice) => Promise.resolve(void notices.push(notice)) },
  renterAsk: { approval: () => Promise.resolve({ url: 'https://hold.test/r/link/pay', orderDescription: 'Refundable hold' }) },
  now: () => now,
})
const act = <Result>(work: Parameters<typeof fixture.inShop<Result>>[0]) => inShop(fixture.database, { role: 'hold_app', shopId: fixture.shopId, userId }, work)

async function contestedClaim() {
  now = NOW
  const rental = await fixture.approvedHold(dependencies())
  const placement = await requestHoldPlacement(dependencies(), fixture.shopId, rental.rentalId)
  if (!placement.ok) throw new Error(placement.reason)
  await runExecution(dependencies(), { shopId: fixture.shopId, executionId: placement.executionId })
  await fixture.database.update(rentals).set({ state: 'inspecting' }).where(eq(rentals.id, rental.rentalId))
  const price = (await act((transaction) => claimWorkspace(transaction, rental.rentalId)))?.prices[0]?.id ?? ''
  const drafted = await act((transaction) => draftClaim(transaction, rental.rentalId, userId, [{ priceEntryId: price, reason: 'Scratch on the frame.' }], NOW))
  if (!drafted.ok) throw new Error(drafted.reason)
  await act((transaction) => approveClaim(transaction, drafted.claimId, userId, NOW))
  await act((transaction) => presentClaim(transaction, drafted.claimId, userId, NOW))
  await act((transaction) => replyToClaim(transaction, rental.rentalId, 'contest', 'It was there before.', NOW))
  const [claim] = await fixture.database.select().from(claims).where(eq(claims.id, drafted.claimId))
  if (claim?.decideBy == null) throw new Error('No promise was made.')
  return { rentalId: rental.rentalId, claimId: drafted.claimId, decideBy: claim.decideBy }
}

beforeAll(async () => {
  fixture = await createSettleFixture(() => now)
  userId = (await fixture.inShop((transaction) => transaction.select().from(staffRoles)))[0]?.userId ?? ''
  await act((transaction) => publishPriceList(transaction, fixture.shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries: [{ description: 'Scratch', category: 'damage', amount: { cents: 3500, currency: 'EUR' } }], wearPolicy: 'Scuffs are wear.' }, NOW))
})

beforeEach(() => {
  scheduler = createMemoryScheduler()
  notices = []
})

describe('the promise to decide a contest', () => {
  it('is looked at again on its date, and changes nothing before it', async () => {
    const claim = await contestedClaim()
    expect(await runUpkeep(dependencies(), { kind: 'claim_promise', shopId: fixture.shopId, claimId: claim.claimId })).toBe('promise_scheduled')
    expect(scheduler.scheduled().find((work) => work.name === `claim-promise-${claim.claimId}`)).toMatchObject({ at: claim.decideBy, message: { queue: 'upkeep', group: claim.rentalId, body: { shopId: fixture.shopId, claimId: claim.claimId, kind: 'claim_promise' } } })
    expect(notices).toEqual([])
  })

  it('sends an undecided claim to the owner at the date and tells the owners, once', async () => {
    const claim = await contestedClaim()
    now = claim.decideBy
    expect(await runUpkeep(dependencies(), { kind: 'claim_promise', shopId: fixture.shopId, claimId: claim.claimId })).toBe('promise_missed')
    expect(notices).toEqual([{ kind: 'promise_missed', shopId: fixture.shopId, rentalId: claim.rentalId, waived: false }])
    expect((await fixture.database.select().from(claims).where(eq(claims.id, claim.claimId)))[0]?.state).toBe('escalated')
    expect(await runUpkeep(dependencies(), { kind: 'claim_promise', shopId: fixture.shopId, claimId: claim.claimId })).toBe('nothing_to_do')
    expect(notices).toHaveLength(1)
  })

  it('waives the claim under the owner rule and releases the whole hold through PayPal', async () => {
    await act((transaction) => grantStandingRule(transaction, userId, { dailyCount: 5, days: 30 }, NOW, 'decision_promise_missed'))
    const claim = await contestedClaim()
    now = claim.decideBy
    expect(await runUpkeep(dependencies(), { kind: 'claim_promise', shopId: fixture.shopId, claimId: claim.claimId })).toBe('promise_waived')
    expect(notices).toEqual([{ kind: 'promise_missed', shopId: fixture.shopId, rentalId: claim.rentalId, waived: true }])
    expect((await fixture.database.select().from(holds).where(eq(holds.rentalId, claim.rentalId)))[0]?.state).toBe('released')
  })
})
