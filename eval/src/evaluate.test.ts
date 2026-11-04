import { copyFile, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ComparisonModel } from '@hold/compare'
import { evalRuns } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import type { TestDatabase } from '@hold/db/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runEvaluation } from './evaluate.ts'

const SAMPLE = join(import.meta.dirname, '../../apps/web/public/images/sample-handover.jpg')
let database: TestDatabase
let root: string
beforeAll(async () => {
  database = await createTestDatabase()
  root = await mkdtemp(join(tmpdir(), 'hold-evaluate-'))
  await mkdir(join(root, 'gate'))
  for (const name of ['c1-before', 'c1-after', 'c2-before', 'c2-after']) await copyFile(SAMPLE, join(root, 'gate', `${name}.jpg`))
  const pair = (id: string) => ({ id, half: 'gate', group: 'clean_easy', origin: 'real', view: 'frame-left', before: `gate/${id}-before.jpg`, after: `gate/${id}-after.jpg`, labels: [], knownMarks: [] })
  await writeFile(join(root, 'manifest.json'), JSON.stringify({ version: 1, itemType: 'City e-bike', wearPolicy: 'Scuffs are wear.', priceCodes: [], cases: [pair('c1'), pair('c2')] }))
})
afterAll(async () => { await database.$client.close() })

// The model sees no change on either clean pair.
const quietModel: ComparisonModel = { look: () => Promise.resolve({ kind: 'result', model: 'recorded-model', inputTokens: 500, outputTokens: 50, data: { sameItem: true, sameView: true, findings: [], dismissed: [] } }) }
// Every photograph a different shot.
let shot = 0
const fingerprint = () => { shot += 1; return Promise.resolve({ sha256: String(shot), perceptualHash: String(shot) }) }

describe('one command over one half of the set', () => {
  // A throttled run measures the account's quota, not the comparison: every pair would read as sent to a person.
  it('stops, writing nothing, when the model is throttled', async () => {
    const throttled: ComparisonModel = { look: () => Promise.resolve({ kind: 'throttled', model: 'recorded-model' }) }
    const resultsDir = await mkdtemp(join(tmpdir(), 'hold-throttled-'))
    const before = (await database.select().from(evalRuns)).length
    await expect(runEvaluation({ root, half: 'gate', resultsDir, accept: true, limits: null }, { model: throttled, fingerprint, database, now: () => new Date('2026-10-29T16:00:00Z'), pipelineVersion: 'inspection-3+throttled' })).rejects.toThrow('throttled')
    expect(await readdir(resultsDir)).toEqual([])
    expect(await database.select().from(evalRuns)).toHaveLength(before)
  })

  it('runs every pair, writes the report and records the run', async () => {
    const resultsDir = await mkdtemp(join(tmpdir(), 'hold-results-'))
    const outcome = await runEvaluation({ root, half: 'gate', resultsDir, accept: true, limits: null }, { model: quietModel, fingerprint, database, now: () => new Date('2026-10-28T10:00:00Z'), pipelineVersion: 'inspection-1+test' })
    expect(outcome.gate).toEqual({ outcome: 'no_baseline', reasons: [] })
    const report = await readFile(outcome.reportPath, 'utf8')
    expect(report).toContain('Gate: no accepted run to compare against.')
    expect(report).toContain('| Clean returns wrongly flagged | 0 of 2 (below about 84% at 95% confidence, not "never")')
    const [row] = await database.select().from(evalRuns)
    expect(row).toMatchObject({ half: 'gate', caseCount: 2, syntheticCount: 0, accepted: true, gatePassed: true, gateReasons: ['no_baseline'], pipelineVersion: 'inspection-1+test', model: 'recorded-model' })
    expect(row?.thresholds).toEqual({ minConfidence: 0.9, secondLookMinConfidence: 0.6, knownMarkOverlap: 0.5 })
    expect(row?.measures.cleanWronglyFlagged).toEqual({ count: 0, total: 2 })
    // Every pair is kept with the run, for the open scorecard to show case by case.
    expect(row?.cases.map((each) => [each.id, each.before, each.state])).toEqual([['c1', 'gate/c1-before.jpg', 'clean'], ['c2', 'gate/c2-before.jpg', 'clean']])
  })

  // A look at some groups, such as the damage pairs alone, costs a fraction of a half and must never count as a run.
  it('runs only the groups asked for, and neither records nor accepts that run', async () => {
    const mixed = await mkdtemp(join(tmpdir(), 'hold-groups-'))
    await mkdir(join(mixed, 'tuning'))
    for (const name of ['d1-before', 'd1-after', 'c1-before', 'c1-after']) await copyFile(SAMPLE, join(mixed, 'tuning', `${name}.jpg`))
    const pair = (id: string, group: string, labels: unknown[]) => ({ id, half: 'tuning', group, origin: 'synthetic', view: 'frame-left', before: `tuning/${id}-before.jpg`, after: `tuning/${id}-after.jpg`, labels, knownMarks: [] })
    await writeFile(join(mixed, 'manifest.json'), JSON.stringify({ version: 1, itemType: 'City e-bike', wearPolicy: 'Scuffs are wear.', priceCodes: [], cases: [pair('d1', 'damage', [{ kind: 'damage', region: { x: 0.4, y: 0.4, width: 0.1, height: 0.1 } }]), pair('c1', 'clean_easy', [])] }))
    const resultsDir = await mkdtemp(join(tmpdir(), 'hold-results-'))
    const before = (await database.select().from(evalRuns)).length
    const dependencies = { model: quietModel, fingerprint, database, now: () => new Date('2026-11-04T12:00:00Z'), pipelineVersion: 'inspection-3+groups' }
    const outcome = await runEvaluation({ root: mixed, half: 'tuning', resultsDir, accept: false, limits: null, groups: ['damage'] }, dependencies)
    expect(outcome.record.cases.map((each) => each.id)).toEqual(['d1'])
    expect(outcome.runId).toBeUndefined()
    expect(await database.select().from(evalRuns)).toHaveLength(before)
    await expect(runEvaluation({ root: mixed, half: 'tuning', resultsDir, accept: true, limits: null, groups: ['damage'] }, dependencies)).rejects.toThrow('never accepted')
  })

  it('does not accept a run that fails the gate against the accepted one', async () => {
    const flagging: ComparisonModel = { look: () => Promise.resolve({ kind: 'result', model: 'recorded-model', inputTokens: 500, outputTokens: 50, data: { sameItem: true, sameView: true, findings: [{ region: { x: 0.4, y: 0.4, width: 0.1, height: 0.1 }, class: 'new_damage', confidence: 0.97, description: 'A scratch.', priceCode: null }], dismissed: [] } }) }
    const resultsDir = await mkdtemp(join(tmpdir(), 'hold-results-'))
    const outcome = await runEvaluation({ root, half: 'gate', resultsDir, accept: true, limits: { maxCleanWronglyFlagged: 0.05, maxDamageFoundDrop: 0.05 } }, { model: flagging, fingerprint, database, now: () => new Date('2026-10-28T11:00:00Z'), pipelineVersion: 'inspection-1+weakened' })
    expect(outcome.gate).toEqual({ outcome: 'failed', reasons: ['clean_wrongly_flagged_above_limit'] })
    expect((await database.select().from(evalRuns)).filter((each) => each.accepted)).toHaveLength(1)
  })
})
