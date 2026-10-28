import { measureEvaluation } from '@hold/domain'
import type { EvaluatedCase, Region } from '@hold/domain'
import { recordEvalRun } from '../scorecard-repository.ts'
import type { Database } from '../scope.ts'

// Made-up runs over made-up pairs, for the open scorecard's end-to-end tests: the test environment records them when
// HOLD_EVAL_FIXTURE is on, and nothing else ever does. The photographs are the demonstration's own samples, served
// from the site's images; a real run names the evaluation set's files instead.
const HANDOVER = '/images/sample-handover.jpg'
const DAMAGED = '/images/sample-return-damage.jpg'
const CHIP: Region = { x: 0.36, y: 0.505, width: 0.075, height: 0.16 }
const SCUFF: Region = { x: 0.285, y: 0.77, width: 0.04, height: 0.07 }
const ELSEWHERE: Region = { x: 0.66, y: 0.3, width: 0.06, height: 0.08 }

const pair = (id: string, overrides: Partial<EvaluatedCase>): EvaluatedCase => ({
  id, group: 'clean_easy', origin: 'synthetic', view: 'frame-left', before: HANDOVER, after: HANDOVER, alignment: 0.94,
  labels: [], knownMarks: [], state: 'clean', findings: [], milliseconds: 6200, inputTokens: 5400, outputTokens: 480, ...overrides,
})
const chip = (confidence: number, secondLookConfirmed: boolean | null) => ({ region: CHIP, class: 'new_damage' as const, confidence, secondLookConfirmed })

export const FIXTURE_CASES: readonly EvaluatedCase[] = [
  pair('clean-easy-01', {}),
  pair('clean-easy-02', { alignment: 0.97 }),
  pair('clean-hard-01', { group: 'clean_hard', alignment: 0.81 }),
  pair('clean-hard-02', { group: 'clean_hard', state: 'findings', alignment: 0.78, findings: [{ region: ELSEWHERE, class: 'new_damage', confidence: 0.91, secondLookConfirmed: true }] }),
  pair('wear-01', { group: 'wear', findings: [{ region: SCUFF, class: 'wear', confidence: 0.88, secondLookConfirmed: null }] }),
  pair('wear-02', { group: 'wear', state: 'deferred', findings: [{ region: ELSEWHERE, class: 'uncertain', confidence: 0.55, secondLookConfirmed: null }] }),
  pair('damage-01', { group: 'damage', after: DAMAGED, state: 'findings', labels: [{ kind: 'damage', region: CHIP }], findings: [chip(0.96, true)] }),
  pair('damage-02', { group: 'damage', after: DAMAGED, state: 'findings', alignment: 0.89, labels: [{ kind: 'damage', region: CHIP }], findings: [chip(0.93, true)] }),
  pair('damage-03', { group: 'damage', after: DAMAGED, state: 'deferred', alignment: 0.72, labels: [{ kind: 'damage', region: CHIP }], findings: [{ ...chip(0.74, false), region: { ...CHIP, x: 0.52 } }] }),
  pair('known-mark-01', { group: 'known_mark', knownMarks: [SCUFF], findings: [{ region: SCUFF, class: 'known_mark', confidence: 0.9, secondLookConfirmed: null }] }),
  pair('reused-01', { group: 'identity', origin: 'real', state: 'deferred', alignment: null, milliseconds: 40, inputTokens: 0, outputTokens: 0 }),
]

function run(cases: readonly EvaluatedCase[], completedAt: Date, pipelineVersion: string) {
  const measures = measureEvaluation(cases)
  return {
    half: 'gate' as const, dataSetVersion: 'f'.repeat(64), pipelineVersion, model: 'fixture-model', promptVersion: 'fixture', thresholds: { minConfidence: 0.9 },
    caseCount: cases.length, syntheticCount: cases.filter((each) => each.origin === 'synthetic').length, measures, realMeasures: measureEvaluation(cases.filter((each) => each.origin === 'real')),
    cases, gateLimits: { maxCleanWronglyFlagged: 0.2, maxDamageFoundDrop: 0.15 }, gatePassed: true, gateReasons: [], accepted: true, resultsKey: 'fixture', startedAt: completedAt, completedAt,
  }
}

export async function recordFixtureEvalRuns(database: Database, now: Date): Promise<void> {
  const earlier = FIXTURE_CASES.map((each) => (each.id === 'damage-02' ? { ...each, state: 'deferred' as const, findings: [] } : each))
  await recordEvalRun(database, { ...run(earlier, new Date(now.getTime() - 3 * 86_400_000), 'fixture-1'), gateLimits: null, gateReasons: ['first_run'] })
  await recordEvalRun(database, run(FIXTURE_CASES, now, 'fixture-2'))
}
