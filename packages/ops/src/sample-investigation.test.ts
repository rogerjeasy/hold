import { addSampleRentals, auditLog, inShop, opsRuns, proposals, sampleInvestigation, startSampleInvestigation } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import { SAMPLE_INVESTIGATION_TOKENS } from '@hold/domain'
import type { TestDatabase } from '@hold/db/testing'
import { readyRentalShop } from '@hold/db/testing/ready-rental'
import type { ReadyRentalShop } from '@hold/db/testing/ready-rental'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { InvestigationAnswer, Investigator } from './investigator.ts'
import { runOperations } from './run-operations.ts'
import type { OpsDependencies } from './run-operations.ts'

const now = new Date('2026-11-03T09:00:00Z')
let database: TestDatabase
let shop: ReadyRentalShop
let counter = 0
beforeAll(async () => { database = await createTestDatabase() })
afterAll(async () => { await database.$client.close() })

beforeEach(async () => {
  counter += 1
  shop = await readyRentalShop(database, `ops-samples-${String(counter)}`, now)
  await shop.act((transaction) => addSampleRentals(transaction, { shopId: shop.scope.shopId, userId: shop.scope.userId ?? '', timeZone: 'UTC', now }))
})

const asWorker = <Result>(work: Parameters<typeof inShop<Result>>[2]) => inShop(database, { role: 'hold_worker', shopId: shop.scope.shopId }, work)
const start = async (at = now) => {
  const started = await shop.act((transaction) => startSampleInvestigation(transaction, at))
  if (!started.ok) throw new Error(started.reason)
  return started.runId
}

// An investigator that reads PayPal once for each entry and answers with the kind its exception allows.
function investigator(answers: (kind: string) => InvestigationAnswer | 'refused'): Investigator & { readonly asked: string[]; readonly read: string[] } {
  const asked: string[] = []
  const read: string[] = []
  return {
    asked,
    read,
    async investigate(request, tools) {
      asked.push(request.exceptionKind)
      read.push(await tools.call(request.exceptionKind === 'dispute_open' ? 'get_dispute' : 'get_order', {}))
      const answer = answers(request.exceptionKind)
      return answer === 'refused' ? { kind: 'refused', model: 'scripted', inputTokens: 50, outputTokens: 0 } : { kind: 'result', data: answer, model: 'us.anthropic.claude-opus-4-6-v1', inputTokens: 4000, outputTokens: 300 }
    },
  }
}
const answerFor = (kind: string): InvestigationAnswer => kind === 'dispute_open'
  ? { proposalKind: 'respond_to_dispute', reason: 'The renter accepted the scratch before it was charged; answer with the evidence pack.', references: ['SIMULATED-DISPUTE'], draft: 'The renter saw both photographs and accepted the claim before it was charged.', paypalConfirmed: true, observations: [] }
  : { proposalKind: 'request_replacement_hold', reason: 'The hold ends within three days and the bike is still with the renter; ask for a replacement hold.', references: ['SIMULATED-AUTH'], draft: null, paypalConfirmed: true, observations: [] }

const dependencies = (overrides: Partial<OpsDependencies>): OpsDependencies => ({
  database,
  now: () => now,
  investigator: undefined,
  // A sample's PayPal references were never on PayPal: the shop's own account is never asked about them.
  paypal: () => Promise.reject(new Error('The shop\'s PayPal must not be read for samples.')),
  remind: () => Promise.reject(new Error('No reminder is sent for samples.')),
  ...overrides,
})

describe('investigating a demo shop\'s samples, when its owner asks (extensions.md section 6.14)', () => {
  it('asks Claude about each sample entry with PayPal\'s facts simulated from the sample, and writes its answer over the entry', async () => {
    const runId = await start()
    const asking = investigator(answerFor)
    await runOperations(dependencies({ investigator: asking }), { shopId: shop.scope.shopId, trigger: 'manual', samplesRunId: runId })
    expect(asking.asked.sort()).toEqual(['dispute_open', 'hold_ending'])
    expect(asking.read.every((text) => text.includes('"simulated":true'))).toBe(true)
    const entries = await asWorker((transaction) => transaction.select().from(proposals).where(eq(proposals.runId, runId)))
    expect(entries.map((entry) => [entry.kind, entry.model, entry.promptVersion, entry.payload['investigated'], entry.payload['paypalChecked'], entry.payload['simulated']]).sort()).toEqual([
      ['request_replacement_hold', 'us.anthropic.claude-opus-4-6-v1', 'ops-1', 'yes', 'simulated', 'yes'],
      ['respond_to_dispute', 'us.anthropic.claude-opus-4-6-v1', 'ops-1', 'yes', 'simulated', 'yes'],
    ])
    expect(entries.find((entry) => entry.kind === 'respond_to_dispute')?.draft).toBe(answerFor('dispute_open').draft)
    expect(await shop.act((transaction) => sampleInvestigation(transaction, now))).toMatchObject({ state: 'completed', investigated: 2, model: 'us.anthropic.claude-opus-4-6-v1' })
    const [run] = await asWorker((transaction) => transaction.select().from(opsRuns).where(eq(opsRuns.id, runId)))
    expect(run).toMatchObject({ inputTokens: 8000, outputTokens: 600, toolCalls: 2, paypalChecked: false })
    // Every tool call passed the gateway and has its audit line, as in any run.
    const lines = await asWorker((transaction) => transaction.select().from(auditLog).where(eq(auditLog.source, runId)))
    expect(lines.map((line) => line.action).sort()).toEqual(['agent.tool.paypal.get_dispute', 'agent.tool.paypal.get_order'])
  })

  it('leaves the entries as they were and records that Claude did not answer, when it refuses or is not there', async () => {
    const runId = await start()
    await runOperations(dependencies({ investigator: investigator(() => 'refused') }), { shopId: shop.scope.shopId, trigger: 'manual', samplesRunId: runId })
    expect(await asWorker((transaction) => transaction.select().from(proposals).where(eq(proposals.runId, runId)))).toEqual([])
    expect(await shop.act((transaction) => sampleInvestigation(transaction, now))).toMatchObject({ state: 'completed', investigated: 0 })
    const later = new Date(now.getTime() + 60_000)
    const again = await start(later)
    await runOperations(dependencies({ investigator: undefined, now: () => later }), { shopId: shop.scope.shopId, trigger: 'manual', samplesRunId: again })
    expect(await shop.act((transaction) => sampleInvestigation(transaction, later))).toMatchObject({ runId: again, state: 'completed', investigated: 0, model: null })
  })

  it('stops at a sample run\'s own token ceiling, far below a nightly run\'s, so the next entry is not asked about', async () => {
    const asked: string[] = []
    const costly: Investigator = {
      investigate(request) {
        asked.push(request.exceptionKind)
        return Promise.resolve({ kind: 'result', data: answerFor(request.exceptionKind), model: 'us.anthropic.claude-opus-4-6-v1', inputTokens: SAMPLE_INVESTIGATION_TOKENS, outputTokens: 0 })
      },
    }
    const runId = await start()
    await runOperations(dependencies({ investigator: costly }), { shopId: shop.scope.shopId, trigger: 'manual', samplesRunId: runId })
    expect(asked).toHaveLength(1)
  })

  it('keeps a steered answer off the entry: a kind the sample does not allow writes nothing', async () => {
    const runId = await start()
    await runOperations(dependencies({ investigator: investigator(() => ({ ...answerFor('hold_ending'), proposalKind: 'release_hold' })) }), { shopId: shop.scope.shopId, trigger: 'manual', samplesRunId: runId })
    expect(await asWorker((transaction) => transaction.select().from(proposals).where(eq(proposals.runId, runId)))).toEqual([])
  })
})
