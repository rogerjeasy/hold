import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { COMPARISON_MODEL, PROMPT_VERSION } from '@hold/compare'
import type { ComparisonModel, FingerprintedPhoto } from '@hold/compare'
import { acceptedEvalRunAsOwner, recordEvalRun } from '@hold/db'
import type { Database } from '@hold/db'
import { checkGate, INSPECTION_LIMITS, measureEvaluation } from '@hold/domain'
import type { EvaluatedCase, GateLimits } from '@hold/domain'
import { loadHalf } from './manifest.ts'
import type { Half } from './manifest.ts'
import { renderReport } from './report.ts'
import type { RunRecord } from './report.ts'
import { runCase } from './run-case.ts'

export type EvaluationOptions = {
  readonly root: string
  readonly half: Half
  readonly resultsDir: string
  // Make this run the one the scorecard shows and the next run is measured against, if it passes the gate.
  readonly accept: boolean
  // Set by a person after the first run (section 5.6). Null until then.
  readonly limits: GateLimits | null
  readonly limit?: number
}

export type EvaluationDependencies = {
  readonly model: ComparisonModel
  readonly fingerprint: (photo: Buffer) => Promise<FingerprintedPhoto>
  // The database as its owner, or nothing for a run that is not recorded.
  readonly database: Database | undefined
  readonly now: () => Date
  readonly pipelineVersion: string
}

// Pairs run a few at a time: each makes several model calls, and Bedrock limits how many run at once.
const CONCURRENT_PAIRS = 3

async function inTurn<Item, Result>(items: readonly Item[], work: (item: Item) => Promise<Result>): Promise<Result[]> {
  const results: Result[] = new Array<Result>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next
      next += 1
      const item = items[index]
      if (item !== undefined) results[index] = await work(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENT_PAIRS, items.length) }, worker))
  return results
}

// Runs one half of the set through the comparison, measures it, checks the gate and writes the report and the
// eval_runs row (X0.2). The model's name in the record is the one Bedrock reports answering.
export async function runEvaluation(options: EvaluationOptions, dependencies: EvaluationDependencies) {
  const started = dependencies.now()
  const loaded = await loadHalf(options.root, options.half)
  const cases = options.limit === undefined ? loaded.cases : loaded.cases.slice(0, options.limit)
  const answering = new Set<string>()
  const model: ComparisonModel = { look: async (request, signal) => { const reply = await dependencies.model.look(request, signal); if (reply.kind === 'result') answering.add(reply.model); return reply } }
  const clock = () => Date.now()
  const evaluated: EvaluatedCase[] = await inTurn(cases, (each) => runCase({ read: (path) => readFile(join(options.root, path)), fingerprint: dependencies.fingerprint, model, now: clock }, each, loaded))
  const measures = measureEvaluation(evaluated)
  const realMeasures = measureEvaluation(evaluated.filter((each) => each.origin === 'real'))
  const accepted = dependencies.database === undefined ? undefined : await acceptedEvalRunAsOwner(dependencies.database)
  if (accepted !== undefined && options.limits === null) throw new Error('An accepted run exists: set the gate limits in eval/gate-limits.json before the next run.')
  const gate = checkGate({ current: measures, accepted: accepted?.measures ?? null, limits: options.limits ?? { maxCleanWronglyFlagged: 1, maxDamageFoundDrop: 1 } })
  const completedAt = dependencies.now()
  const record: RunRecord = { half: options.half, dataSetVersion: loaded.dataSetVersion, pipelineVersion: dependencies.pipelineVersion, model: [...answering].join(', ') || COMPARISON_MODEL, completedAt, gate, cases: evaluated, measures, realMeasures }
  const stamp = completedAt.toISOString().replaceAll(/[:.]/g, '-')
  await mkdir(options.resultsDir, { recursive: true })
  const reportPath = join(options.resultsDir, `${stamp}-${options.half}.md`)
  const resultsPath = join(options.resultsDir, `${stamp}-${options.half}.json`)
  await writeFile(reportPath, renderReport(record))
  await writeFile(resultsPath, `${JSON.stringify(record, null, 2)}\n`)
  const runId = dependencies.database === undefined ? undefined : await recordEvalRun(dependencies.database, {
    half: options.half, dataSetVersion: loaded.dataSetVersion, pipelineVersion: dependencies.pipelineVersion, model: record.model, promptVersion: PROMPT_VERSION,
    thresholds: { minConfidence: INSPECTION_LIMITS.minConfidence, knownMarkOverlap: INSPECTION_LIMITS.knownMarkOverlap },
    caseCount: evaluated.length, syntheticCount: evaluated.filter((each) => each.origin === 'synthetic').length, measures, realMeasures,
    gateLimits: options.limits, gatePassed: gate.pass, gateReasons: [...gate.reasons],
    accepted: options.accept && gate.pass && options.half === 'gate', resultsKey: resultsPath, startedAt: started, completedAt,
  })
  return { gate, reportPath, resultsPath, runId, record }
}
