import { detectExceptions } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { authorizations, holds, proposals, rentals, shopExceptions } from './schema/index.ts'
import { beginOpsRun, completeOpsRun, decideProposal, morningQueue, recordExceptions, shopSnapshot, writeProposal } from './ops-repository.ts'
import { inShop } from './scope.ts'
import type { Transaction } from './scope.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'

const now = new Date('2026-10-20T12:00:00Z')
let database: TestDatabase
let shop: ReadyRentalShop
let other: ReadyRentalShop
beforeAll(async () => { database = await createTestDatabase(); shop = await readyRentalShop(database, 'ops', now); other = await readyRentalShop(database, 'ops-other', now) })
afterAll(async () => { await database.$client.close() })

// The operations agent runs in the worker, as hold_worker.
const asWorker = <Result>(work: (transaction: Transaction) => Promise<Result>) => inShop(database, { role: 'hold_worker', shopId: shop.scope.shopId }, work)

// A rental out with its hold ending within three days: the hold_ending detector's case.
async function holdEnding() {
  const rental = await shop.readyRental()
  await database.update(rentals).set({ state: 'out' }).where(eq(rentals.id, rental.rentalId))
  const [hold] = await database.select().from(holds).where(eq(holds.rentalId, rental.rentalId))
  await database.update(authorizations).set({ validUntil: new Date(now.getTime() + 48 * 3_600_000) }).where(eq(authorizations.id, hold?.currentAuthorizationId ?? ''))
  return { rentalId: rental.rentalId, holdId: hold?.id ?? '' }
}

describe('the operations agent\'s records', () => {
  it('reads the shop\'s records into what the detectors need', async () => {
    const { holdId } = await holdEnding()
    const snapshot = await shop.act((transaction) => shopSnapshot(transaction, now, { disputes: [], differences: [] }))
    expect(snapshot.holds.find((hold) => hold.id === holdId)).toMatchObject({ state: 'placed', reservedCents: 30000, replacementStarted: false })
    expect(detectExceptions(snapshot).some((each) => each.kind === 'hold_ending' && each.subjectId === holdId)).toBe(true)
  })

  it('records each exception once, however often the run repeats, and one proposal per subject and state', async () => {
    const run = await asWorker((transaction) => beginOpsRun(transaction, 'nightly', now))
    const found = detectExceptions(await asWorker((transaction) => shopSnapshot(transaction, now, { disputes: [], differences: [] })))
    const first = await asWorker((transaction) => recordExceptions(transaction, run, found, now))
    const second = await asWorker((transaction) => recordExceptions(transaction, run, found, now))
    expect(second.map((each) => each.id)).toEqual(first.map((each) => each.id))
    const ending = first.find((each) => each.kind === 'hold_ending')
    if (ending === undefined) throw new Error('No exception')
    const proposal = { exceptionId: ending.id, kind: 'request_replacement_hold' as const, reason: 'The hold ends in two days and the bike is still out.', references: ['AUTH-1'], draft: null, raisedByAgent: false, runId: run, model: 'test-model', promptVersion: 'ops-1' }
    expect(await asWorker((transaction) => writeProposal(transaction, proposal, now))).toMatchObject({ written: true })
    expect(await asWorker((transaction) => writeProposal(transaction, proposal, now))).toMatchObject({ written: false })
    await asWorker((transaction) => completeOpsRun(transaction, run, { toolCalls: 3, inputTokens: 100, outputTokens: 20, model: 'test-model', promptVersion: 'ops-1', paypalChecked: true, counts: { exceptions: first.length } }, now))
  })

  it('refuses a proposal of a kind the exception does not allow', async () => {
    const [ending] = await shop.act((transaction) => transaction.select().from(shopExceptions).where(eq(shopExceptions.kind, 'hold_ending')))
    const result = await asWorker((transaction) => writeProposal(transaction, { exceptionId: ending?.id ?? '', kind: 'release_hold', reason: 'Release every hold now.', references: [], draft: null, raisedByAgent: false, runId: null, model: null, promptVersion: null }, now))
    expect(result).toEqual({ written: false, reason: 'kind_not_allowed' })
  })

  it('shows the queue with amounts read from the records, nearest deadline first', async () => {
    const queue = await shop.act((transaction) => morningQueue(transaction, now))
    const entry = queue.find((each) => each.kind === 'request_replacement_hold')
    expect(entry).toMatchObject({ amountCents: 30000, currency: 'EUR', reason: 'The hold ends in two days and the bike is still out.' })
    expect(await other.act((transaction) => morningQueue(transaction, now))).toEqual([])
  })

  it('supersedes a proposal whose subject changed since it was written, and executes nothing', async () => {
    const [entry] = (await shop.act((transaction) => morningQueue(transaction, now))).filter((each) => each.kind === 'request_replacement_hold')
    const [hold] = await database.select().from(holds).where(eq(holds.id, entry?.subjectId ?? ''))
    await database.update(holds).set({ state: 'released' }).where(eq(holds.id, hold?.id ?? ''))
    const decision = await shop.act((transaction) => decideProposal(transaction, entry?.id ?? '', shop.scope.userId ?? '', { decision: 'approve', reason: '' }, now))
    expect(decision).toEqual({ ok: false, reason: 'superseded' })
    const [row] = await database.select().from(proposals).where(eq(proposals.id, entry?.id ?? ''))
    expect(row?.state).toBe('superseded')
  })
})
