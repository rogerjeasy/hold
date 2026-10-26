import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { authorizations, beginComparison, evalRuns, captureSession, claims, comparisons, completeComparison, draftClaim, findingOutcomes, holds, priceEntries, recordPhoto, rentals, sealSession, startCaptureSession } from './index.ts'
import { closeSettledRental } from './settlement-repository.ts'
import { acceptedEvalRun, fieldRecord, recordEvalRun, recordFindingOutcomes } from './scorecard-repository.ts'
import { measureEvaluation } from '@hold/domain'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'

const now = new Date('2026-10-20T12:00:00Z')
let database: TestDatabase
let shop: ReadyRentalShop
let other: ReadyRentalShop
beforeAll(async () => { database = await createTestDatabase(); shop = await readyRentalShop(database, 'scorecard', now); other = await readyRentalShop(database, 'scorecard-other', now) })
afterAll(async () => { await database.$client.close() })

const finding = (x: number) => ({ view: 'left-side', region: { x, y: 0.4, width: 0.1, height: 0.1 }, class: 'new_damage' as const, confidence: 0.95, description: 'A fresh scratch.', secondLookConfirmed: true, matchedMarkId: null, suggestedPriceEntryId: null })

// A rental returned with two damage findings, one of which staff turned into a claim line.
async function returnedWithTwoFindings() {
  const rental = await shop.readyRental()
  for (const kind of ['handover', 'return'] as const) {
    const opened = await shop.act((transaction) => startCaptureSession(transaction, { rentalId: rental.rentalId, rentalItemId: rental.rentalItemIds[0] ?? '', kind, actorUserId: shop.scope.userId ?? null }, now))
    if (!opened.ok) throw new Error(opened.reason)
    const session = await shop.act((transaction) => captureSession(transaction, opened.sessionId))
    for (const view of session?.plan.filter((each) => each.required) ?? []) await shop.act((transaction) => recordPhoto(transaction, opened.sessionId, { view: view.key, evidenceKey: `${opened.sessionId}/${view.key}`, sha256: (kind === 'handover' ? 'a' : 'b').repeat(64), quality: { sharpness: 120, shadows: 20, highlights: 220, filled: 0.6 } }, now))
    await shop.act((transaction) => sealSession(transaction, opened.sessionId, now))
  }
  const [comparison] = await shop.act((transaction) => transaction.select().from(comparisons).where(eq(comparisons.state, 'pending')))
  if (comparison === undefined) throw new Error('No comparison')
  const lease = await shop.act((transaction) => beginComparison(transaction, comparison.id, now))
  if (lease === undefined) throw new Error('No lease')
  await shop.act((transaction) => completeComparison(transaction, comparison.id, lease.startedAt, { state: 'findings', model: 'test-model', promptVersion: 'test-v1', alignment: {}, reason: null, simulated: false, findings: [finding(0.2), finding(0.6)] }, now))
  const kept = await shop.act(async (transaction) => (await transaction.query.findings.findFirst({ where: (each, { eq: equal }) => equal(each.comparisonId, comparison.id) }))?.id ?? '')
  const [price] = await shop.act((transaction) => transaction.select().from(priceEntries))
  const draft = await shop.act((transaction) => draftClaim(transaction, rental.rentalId, shop.scope.userId ?? '', [{ priceEntryId: price?.id ?? '', findingId: kept }], now))
  if (!draft.ok) throw new Error(draft.reason)
  return { rentalId: rental.rentalId, kept }
}

describe('the field record', () => {
  it('labels each finding by what a person finally did with it, once', async () => {
    const { rentalId, kept } = await returnedWithTwoFindings()
    await shop.act((transaction) => recordFindingOutcomes(transaction, rentalId, now))
    await shop.act((transaction) => recordFindingOutcomes(transaction, rentalId, now))
    const rows = await shop.act((transaction) => transaction.select().from(findingOutcomes).where(eq(findingOutcomes.rentalId, rentalId)))
    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.findingId === kept)?.verdict).toBe('upheld')
    expect(rows.find((row) => row.findingId !== kept)?.verdict).toBe('removed_by_staff')
  })

  it('writes the labels in the transaction that closes the settled rental', async () => {
    const { rentalId } = await returnedWithTwoFindings()
    await database.update(claims).set({ state: 'closed' }).where(eq(claims.rentalId, rentalId))
    await database.update(rentals).set({ state: 'settling' }).where(eq(rentals.id, rentalId))
    const [hold] = await database.select().from(holds).where(eq(holds.rentalId, rentalId))
    await database.update(authorizations).set({ state: 'captured' }).where(eq(authorizations.holdId, hold?.id ?? ''))
    await shop.act((transaction) => closeSettledRental(transaction, rentalId, 'captured', now))
    expect(await shop.act((transaction) => transaction.select().from(findingOutcomes).where(eq(findingOutcomes.rentalId, rentalId)))).toHaveLength(2)
  })

  it('counts by month the findings a person removed', async () => {
    const record = await shop.act((transaction) => fieldRecord(transaction))
    expect(record).toEqual([{ month: '2026-10', removed: 2, total: 4 }])
  })

  it('shows another shop nothing of this shop\'s record', async () => {
    expect(await other.act((transaction) => transaction.select().from(findingOutcomes))).toEqual([])
    expect(await other.act((transaction) => fieldRecord(transaction))).toEqual([])
  })
})

describe('the scorecard\'s runs', () => {
  const run = (accepted: boolean, completedAt: Date) => ({ half: 'gate' as const, dataSetVersion: 'a'.repeat(64), pipelineVersion: 'inspection-1+abc', model: 'anthropic.claude-opus-5-5', promptVersion: 'inspection-1', thresholds: { minConfidence: 0.9 }, caseCount: 0, syntheticCount: 0, measures: measureEvaluation([]), realMeasures: measureEvaluation([]), gateLimits: null, gatePassed: true, gateReasons: ['first_run'], accepted, resultsKey: 'eval/results/run.json', startedAt: completedAt, completedAt })

  it('shows every shop the last accepted run of the gate half, and nothing a run did not accept', async () => {
    await recordEvalRun(database, run(true, new Date('2026-10-27T10:00:00Z')))
    await recordEvalRun(database, run(false, new Date('2026-10-28T10:00:00Z')))
    const shown = await other.act((transaction) => acceptedEvalRun(transaction))
    expect(shown?.completedAt).toEqual(new Date('2026-10-27T10:00:00Z'))
  })

  it('lets the evaluation login record and read runs, and change none', async () => {
    const asEval = <Result>(work: (transaction: Parameters<Parameters<typeof database.transaction>[0]>[0]) => Promise<Result>) => database.transaction(async (transaction) => { await transaction.execute(sql`set local role hold_eval`); return work(transaction) })
    await asEval((transaction) => transaction.insert(evalRuns).values(run(false, new Date('2026-10-29T10:00:00Z'))))
    expect((await asEval((transaction) => transaction.select().from(evalRuns))).length).toBeGreaterThan(0)
    await expect(asEval((transaction) => transaction.update(evalRuns).set({ accepted: true }))).rejects.toThrow()
    await expect(asEval((transaction) => transaction.insert(evalRuns).values(run(true, new Date('2026-10-29T11:00:00Z'))))).rejects.toThrow()
    await expect(asEval((transaction) => transaction.select().from(findingOutcomes))).rejects.toThrow()
  })

  it('lets no service write a run', async () => {
    await expect(shop.act((transaction) => transaction.insert(evalRuns).values(run(true, now)))).rejects.toThrow()
  })
})
