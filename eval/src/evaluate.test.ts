import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
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
const quietModel: ComparisonModel = { look: () => Promise.resolve({ kind: 'result', model: 'recorded-model', inputTokens: 500, outputTokens: 50, data: { sameItem: true, sameView: true, findings: [] } }) }
// Every photograph a different shot.
let shot = 0
const fingerprint = () => { shot += 1; return Promise.resolve({ sha256: String(shot), perceptualHash: String(shot) }) }

describe('one command over one half of the set', () => {
  it('runs every pair, writes the report and records the run', async () => {
    const resultsDir = await mkdtemp(join(tmpdir(), 'hold-results-'))
    const outcome = await runEvaluation({ root, half: 'gate', resultsDir, accept: true, limits: null }, { model: quietModel, fingerprint, database, now: () => new Date('2026-10-28T10:00:00Z'), pipelineVersion: 'inspection-1+test' })
    expect(outcome.gate).toEqual({ pass: true, reasons: ['first_run'] })
    const report = await readFile(outcome.reportPath, 'utf8')
    expect(report).toContain('| Clean returns wrongly flagged | 0 of 2 (below about 84% at 95% confidence, not "never")')
    const [row] = await database.select().from(evalRuns)
    expect(row).toMatchObject({ half: 'gate', caseCount: 2, syntheticCount: 0, accepted: true, gatePassed: true, pipelineVersion: 'inspection-1+test', model: 'recorded-model' })
    expect(row?.measures.cleanWronglyFlagged).toEqual({ count: 0, total: 2 })
  })

  it('does not accept a run that fails the gate against the accepted one', async () => {
    const flagging: ComparisonModel = { look: () => Promise.resolve({ kind: 'result', model: 'recorded-model', inputTokens: 500, outputTokens: 50, data: { sameItem: true, sameView: true, findings: [{ region: { x: 0.4, y: 0.4, width: 0.1, height: 0.1 }, class: 'new_damage', confidence: 0.97, description: 'A scratch.', priceCode: null }] } }) }
    const resultsDir = await mkdtemp(join(tmpdir(), 'hold-results-'))
    const outcome = await runEvaluation({ root, half: 'gate', resultsDir, accept: true, limits: { maxCleanWronglyFlagged: 0.05, maxDamageFoundDrop: 0.05 } }, { model: flagging, fingerprint, database, now: () => new Date('2026-10-28T11:00:00Z'), pipelineVersion: 'inspection-1+weakened' })
    expect(outcome.gate).toEqual({ pass: false, reasons: ['clean_wrongly_flagged_above_limit'] })
    expect((await database.select().from(evalRuns)).filter((each) => each.accepted)).toHaveLength(1)
  })
})
