import { moneyEvents, rentalHold } from '@hold/db'
import { addDays } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryScheduler, executionMessageSchema, requestHoldPlacement, runExecution, runUpkeep } from './index.ts'
import type { MemoryScheduler, Notice, SettleDependencies } from './index.ts'
import { createSettleFixture } from './testing/settle-fixture.ts'
import type { SettleFixture } from './testing/settle-fixture.ts'

// Hold upkeep (architecture.md section 7.4), on a clock the tests move. The fake PayPal shares it.
let clock = new Date()
let fixture: SettleFixture
let scheduler: MemoryScheduler
let notices: Notice[]
let tell: (notice: Notice) => Promise<void>

const dependencies = (): SettleDependencies => ({
  database: fixture.database,
  paypalFor: () => fixture.fake,
  paypalMode: 'sandbox',
  // Executions run at once, as in the test environment; other queues are not needed here.
  send: async (message) => {
    if (message.queue === 'executions') await runExecution(dependencies(), executionMessageSchema.parse(message.body))
  },
  scheduler,
  notifier: { tell: (notice) => tell(notice) },
  renterAsk: { approval: (_shopId, rentalId) => Promise.resolve({ url: `https://hold.test/r/link-${rentalId}/pay`, orderDescription: 'Refundable hold' }) },
  now: () => clock,
})

// A hold placed now, and the expiry step its upkeep scheduled.
async function placedHold() {
  clock = new Date()
  scheduler = createMemoryScheduler()
  const { rentalId } = await fixture.approvedHold(dependencies())
  const requested = await requestHoldPlacement(dependencies(), fixture.shopId, rentalId)
  if (!requested.ok) throw new Error(requested.reason)
  await runExecution(dependencies(), { shopId: fixture.shopId, executionId: requested.executionId })
  const expiry = scheduler.scheduled().find((work) => work.message.body['kind'] === 'expire')
  const replacement = scheduler.scheduled().find((work) => work.message.body['kind'] === 'replace')
  if (expiry === undefined || replacement === undefined) throw new Error('No upkeep was scheduled.')
  const body = expiry.message.body as { shopId: string; holdId: string; authorizationId: string; kind: 'expire' }
  return { rentalId, expiry, replacement, body }
}

const holdState = async (rentalId: string) => (await fixture.inShop((transaction) => rentalHold(transaction, rentalId)))?.state

beforeAll(async () => {
  fixture = await createSettleFixture(() => clock)
})

beforeEach(() => {
  scheduler = createMemoryScheduler()
  notices = []
  tell = (notice) => Promise.resolve(void notices.push(notice))
})

describe('a hold reaching its end', () => {
  it('is marked expired once PayPal confirms it, and the owners are told at once', async () => {
    const { rentalId, expiry, body } = await placedHold()
    clock = expiry.at
    expect(await runUpkeep(dependencies(), body)).toBe('expired')
    expect(await holdState(rentalId)).toBe('expired')
    expect(notices).toEqual([{ kind: 'hold_expired', shopId: fixture.shopId, rentalId }])
  })

  it('tells the owners on the next try when telling them failed, and expires the hold only once', async () => {
    const { rentalId, expiry, body } = await placedHold()
    clock = expiry.at
    tell = () => Promise.reject(new Error('Email is down'))
    await expect(runUpkeep(dependencies(), body)).rejects.toThrow(/Email is down/)
    tell = (notice) => Promise.resolve(void notices.push(notice))
    expect(await runUpkeep(dependencies(), body)).toBe('expired')
    expect(notices).toHaveLength(1)
    expect(await holdState(rentalId)).toBe('expired')
  })

  it('waits while PayPal still holds the money, and looks again at the end PayPal gives', async () => {
    const { rentalId, expiry, body } = await placedHold()
    clock = new Date(expiry.at.getTime() - 60_000)
    scheduler = createMemoryScheduler()
    expect(await runUpkeep(dependencies(), body)).toBe('still_valid')
    expect(await holdState(rentalId)).toBe('placed')
    expect(scheduler.scheduled().map((work) => [work.name, work.at])).toEqual([[expiry.name, expiry.at]])
    expect(notices).toEqual([])
  })

  it('does nothing for an authorization the hold no longer rests on', async () => {
    const { rentalId, expiry, body } = await placedHold()
    const other = await placedHold()
    clock = addDays(expiry.at, 1)
    expect(await runUpkeep(dependencies(), { ...body, authorizationId: other.body.authorizationId })).toBe('nothing_to_do')
    expect(await holdState(rentalId)).toBe('placed')
  })
})

describe('replacing a hold before it ends', () => {
  it('asks the renter to approve a new hold for the same amount, with a link to approve it', async () => {
    const { rentalId, expiry, replacement, body } = await placedHold()
    clock = replacement.at
    expect(await runUpkeep(dependencies(), { ...body, kind: 'replace' })).toBe('replacement_asked')
    const hold = await fixture.inShop((transaction) => rentalHold(transaction, rentalId))
    expect(hold?.state).toBe('placed')
    expect(hold?.orderId).toMatch(/^FAKE-ORDER-/)
    expect(fixture.fake.orderLinks(hold?.orderId ?? '')).toMatchObject({ amount: { cents: 300_00, currency: 'EUR' }, returnUrl: `https://hold.test/r/link-${rentalId}/pay`, description: 'Refundable hold' })
    expect(notices).toEqual([{ kind: 'hold_replacement', shopId: fixture.shopId, rentalId, approveUrl: `https://hold.test/r/link-${rentalId}/pay`, holdEndsAt: expiry.at }])
  })

  it('moves the hold onto the replacement the renter approved, releases the old hold, and swaps the schedules', async () => {
    const { rentalId, replacement, body } = await placedHold()
    clock = replacement.at
    await runUpkeep(dependencies(), { ...body, kind: 'replace' })
    const orderId = (await fixture.inShop((transaction) => rentalHold(transaction, rentalId)))?.orderId ?? ''
    fixture.fake.approveOrder(orderId)
    const oldSchedules = scheduler.scheduled().map((work) => work.name)

    // Sent executions run at once here: the authorization, then the release of the old hold.
    expect(await requestHoldPlacement(dependencies(), fixture.shopId, rentalId)).toMatchObject({ ok: true })

    const hold = await fixture.inShop((transaction) => rentalHold(transaction, rentalId))
    expect(hold).toMatchObject({ state: 'placed', orderId: null })
    expect(hold?.validUntil).toEqual(addDays(replacement.at, 29))
    const lines = await fixture.database.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId))
    expect(lines.map((line) => line.kind)).toEqual(['fee_captured', 'hold_placed', 'hold_placed', 'hold_released'])
    const names = scheduler.scheduled().map((work) => work.name)
    for (const name of oldSchedules) expect(names).not.toContain(name)
    expect(names).toHaveLength(2)
  })

  it('asks nothing of a hold already replaced', async () => {
    const { rentalId, replacement, body } = await placedHold()
    const other = await placedHold()
    clock = replacement.at
    expect(await runUpkeep(dependencies(), { ...body, authorizationId: other.body.authorizationId, kind: 'replace' })).toBe('nothing_to_do')
    expect((await fixture.inShop((transaction) => rentalHold(transaction, rentalId)))?.orderId).toBeNull()
  })
})

