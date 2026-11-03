import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { completeOpsRun, decideProposal, writeProposal } from './ops-repository.ts'
import { addSampleRentals } from './sample-rentals.ts'
import { recordSampleInvestigation, sampleEntriesToInvestigate, sampleInvestigation, startSampleInvestigation } from './sample-investigation-repository.ts'
import { opsRuns, outbox, proposals, shopExceptions } from './schema/index.ts'
import { inShop } from './scope.ts'
import type { Transaction } from './scope.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'

const now = new Date('2026-11-03T09:00:00Z')
let database: TestDatabase
let shop: ReadyRentalShop
let counter = 0
beforeAll(async () => { database = await createTestDatabase() })
afterAll(async () => { await database.$client.close() })

// A demo shop with its sample rentals, which seed two entries on the morning queue that no model has looked at.
beforeEach(async () => {
  counter += 1
  shop = await readyRentalShop(database, `samples-investigated-${String(counter)}`, now)
  await shop.act((transaction) => addSampleRentals(transaction, { shopId: shop.scope.shopId, userId: shop.scope.userId ?? '', timeZone: 'UTC', now }))
})

const asWorker = <Result>(work: (transaction: Transaction) => Promise<Result>) => inShop(database, { role: 'hold_worker', shopId: shop.scope.shopId }, work)
const investigated = { reason: 'The hold ends in two days while the bike is still out; ask for a replacement hold.', references: ['SIMULATED-AUTH'], draft: null, model: 'us.anthropic.claude-opus-4-6-v1', promptVersion: 'ops-1' }

describe('the samples the operations agent may be asked to investigate', () => {
  it('lists the sample entries no model has looked at, with the exception each rests on', async () => {
    const entries = await asWorker((transaction) => sampleEntriesToInvestigate(transaction))
    expect(entries.map((entry) => entry.exception.kind).sort()).toEqual(['dispute_open', 'hold_ending'])
    expect(entries.every((entry) => entry.exception.allowed.includes(entry.kind))).toBe(true)
  })

  it('starts one investigation at a time, through the ops-agent queue, and says how it stands', async () => {
    expect(await shop.act((transaction) => sampleInvestigation(transaction, now))).toBeUndefined()
    const started = await shop.act((transaction) => startSampleInvestigation(transaction, now))
    if (!started.ok) throw new Error(started.reason)
    const [message] = await database.select().from(outbox).where(eq(outbox.createdAt, started.at))
    expect(message).toMatchObject({ queue: 'ops-agent', messageGroup: shop.scope.shopId, payload: { trigger: 'manual', samplesRunId: started.runId } })
    expect(await shop.act((transaction) => sampleInvestigation(transaction, now))).toMatchObject({ state: 'running', startedAt: now })
    expect(await shop.act((transaction) => startSampleInvestigation(transaction, new Date(now.getTime() + 60_000)))).toEqual({ ok: false, reason: 'running' })
    const later = new Date(now.getTime() + 90_000)
    await asWorker((transaction) => completeOpsRun(transaction, started.runId, { toolCalls: 3, inputTokens: 9000, outputTokens: 700, model: investigated.model, promptVersion: 'ops-1', paypalChecked: false, counts: { samples: 1, investigated: 2 } }, later))
    expect(await shop.act((transaction) => sampleInvestigation(transaction, later))).toMatchObject({ state: 'completed', completedAt: later, investigated: 2, model: investigated.model })
  })

  it('lets a run that never finished be started again after ten minutes, and says it did not finish', async () => {
    const started = await shop.act((transaction) => startSampleInvestigation(transaction, now))
    const stale = new Date(now.getTime() + 11 * 60_000)
    expect(await shop.act((transaction) => sampleInvestigation(transaction, stale))).toMatchObject({ state: 'stalled' })
    expect(started.ok && (await shop.act((transaction) => startSampleInvestigation(transaction, stale))).ok).toBe(true)
  })

  it('has nothing to start once no sample entry waits', async () => {
    await database.update(proposals).set({ state: 'rejected' }).where(eq(proposals.shopId, shop.scope.shopId))
    expect(await shop.act((transaction) => startSampleInvestigation(transaction, now))).toEqual({ ok: false, reason: 'no_samples' })
  })
})

describe('what an investigation of a sample writes', () => {
  it('rewrites a waiting sample entry with the model\'s words, marked investigated with PayPal\'s facts simulated', async () => {
    const [entry] = await asWorker((transaction) => sampleEntriesToInvestigate(transaction))
    if (entry === undefined) throw new Error('No sample entry.')
    const started = await shop.act((transaction) => startSampleInvestigation(transaction, now))
    if (!started.ok) throw new Error(started.reason)
    expect(await asWorker((transaction) => recordSampleInvestigation(transaction, entry.id, { ...investigated, runId: started.runId }, now))).toBe(true)
    const [row] = await database.select().from(proposals).where(eq(proposals.id, entry.id))
    expect(row).toMatchObject({ state: 'pending', reason: investigated.reason, references: investigated.references, model: investigated.model, promptVersion: 'ops-1', runId: started.runId, payload: { simulated: 'yes', investigated: 'yes', paypalChecked: 'simulated' } })
    expect(row?.payload['fixedReason']).toBeUndefined()
    expect((await asWorker((transaction) => sampleEntriesToInvestigate(transaction))).map((each) => each.id)).not.toContain(entry.id)
    // Still a sample: approving it records the decision and carries nothing out.
    expect(await shop.act((transaction) => decideProposal(transaction, entry.id, shop.scope.userId ?? '', { decision: 'approve', reason: '' }, now))).toMatchObject({ ok: true, state: 'executed' })
  })

  it('never rewrites a real entry, a decided one, or another shop\'s', async () => {
    const [sample] = await asWorker((transaction) => sampleEntriesToInvestigate(transaction))
    const [exception] = await database.select().from(shopExceptions).where(eq(shopExceptions.shopId, shop.scope.shopId))
    if (sample === undefined || exception === undefined) throw new Error('No sample entry.')
    const real = await asWorker((transaction) => writeProposal(transaction, { exceptionId: null, kind: 'note', reason: 'A real note.', references: [], draft: null, raisedByAgent: true, runId: null, model: null, promptVersion: null, subject: { kind: 'rental', id: exception.rentalId ?? '', rentalId: exception.rentalId } }, now))
    if (!real.written) throw new Error('No real entry.')
    const run = (await database.select({ id: opsRuns.id }).from(opsRuns).limit(1))[0]?.id ?? null
    expect(await asWorker((transaction) => recordSampleInvestigation(transaction, real.id, { ...investigated, runId: run }, now))).toBe(false)
    const other = await readyRentalShop(database, `samples-other-${String(counter)}`, now)
    expect(await inShop(database, { role: 'hold_worker', shopId: other.scope.shopId }, (transaction) => recordSampleInvestigation(transaction, sample.id, { ...investigated, runId: run }, now))).toBe(false)
    await database.update(proposals).set({ state: 'rejected' }).where(eq(proposals.id, sample.id))
    expect(await asWorker((transaction) => recordSampleInvestigation(transaction, sample.id, { ...investigated, runId: run }, now))).toBe(false)
    expect((await database.select().from(proposals).where(eq(proposals.id, sample.id)))[0]?.reason).not.toBe(investigated.reason)
  })
})
