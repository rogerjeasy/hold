import { describe, expect, it } from 'vitest'
import { measureEvaluation } from './evaluation.ts'
import type { EvaluatedCase, Measures } from './evaluation.ts'
import { caseVerdict, outcomeMatrix, runTrend } from './scorecard-cases.ts'

// The open scorecard (extensions.md section 5.5): every pair of the accepted run, case by case, judged by the same
// rules as the measures, so the case grid, the matrix and the published figures can never disagree.

const box = (x: number, y: number, size = 0.1) => ({ x, y, width: size, height: size })
const damage = (region = box(0.4, 0.4), confidence = 0.95) => ({ region, class: 'new_damage' as const, confidence, secondLookConfirmed: true })
const pair = (overrides: Partial<EvaluatedCase>): EvaluatedCase => ({
  id: 'case', group: 'clean_easy', origin: 'real', view: 'frame-left', before: 'gate/a-before.jpg', after: 'gate/a-after.jpg', alignment: 0.9,
  labels: [], knownMarks: [], state: 'clean', findings: [], milliseconds: 1000, inputTokens: 100, outputTokens: 10, ...overrides,
})

describe('the verdict on one pair', () => {
  it('passes a clean pair left clean, fails one flagged, and counts one sent to a person as neither', () => {
    expect(caseVerdict(pair({ group: 'clean_hard', state: 'clean' }))).toBe('pass')
    expect(caseVerdict(pair({ group: 'wear', state: 'findings', findings: [damage()] }))).toBe('fail')
    expect(caseVerdict(pair({ group: 'clean_easy', state: 'deferred' }))).toBe('person')
  })

  it('passes a damage pair only when every labelled region was found, and sends an unfound one deferred to a person', () => {
    const labels = [{ kind: 'damage' as const, region: box(0.4, 0.4) }]
    expect(caseVerdict(pair({ group: 'damage', state: 'findings', labels, findings: [damage(box(0.42, 0.42))] }))).toBe('pass')
    expect(caseVerdict(pair({ group: 'damage', state: 'findings', labels, findings: [damage(box(0.8, 0.8))] }))).toBe('fail')
    expect(caseVerdict(pair({ group: 'damage', state: 'deferred', labels }))).toBe('person')
    expect(caseVerdict(pair({ group: 'damage', state: 'clean', labels }))).toBe('fail')
  })

  it('passes a known mark left uncharged, and a wrong item or reused photograph only when it went to a person', () => {
    expect(caseVerdict(pair({ group: 'known_mark', knownMarks: [box(0.2, 0.2)], state: 'clean' }))).toBe('pass')
    expect(caseVerdict(pair({ group: 'known_mark', knownMarks: [box(0.2, 0.2)], state: 'findings', findings: [damage(box(0.21, 0.21))] }))).toBe('fail')
    expect(caseVerdict(pair({ group: 'identity', state: 'deferred' }))).toBe('pass')
    expect(caseVerdict(pair({ group: 'identity', state: 'clean' }))).toBe('fail')
  })
})

describe('the pairs together', () => {
  const cases = [
    pair({ id: 'a', group: 'clean_easy', state: 'clean' }),
    pair({ id: 'b', group: 'clean_hard', state: 'findings', findings: [damage()] }),
    pair({ id: 'c', group: 'wear', state: 'deferred' }),
    pair({ id: 'd', group: 'damage', state: 'findings', labels: [{ kind: 'damage', region: box(0.4, 0.4) }], findings: [damage()] }),
    pair({ id: 'e', group: 'identity', state: 'deferred' }),
  ]

  it('sets what each pair should have ended in against what it did, and agrees with the published figures', () => {
    const matrix = outcomeMatrix(cases)
    expect(matrix).toEqual({
      clean: { clean: 1, findings: 1, deferred: 1 },
      findings: { clean: 0, findings: 1, deferred: 0 },
      deferred: { clean: 0, findings: 0, deferred: 1 },
    })
    const measures = measureEvaluation(cases)
    expect(matrix.clean.findings).toBe(measures.cleanWronglyFlagged.count)
    expect(matrix.clean.clean + matrix.clean.findings + matrix.clean.deferred).toBe(measures.cleanWronglyFlagged.total)
  })
})

describe('run against run', () => {
  const measures = (wrong: number, found: number): Measures => ({ ...measureEvaluation([]), cleanWronglyFlagged: { count: wrong, total: 60 }, damageFound: { count: found, total: 40 } })
  const run = (id: string, accepted: boolean, wrong: number, found: number, limits: { maxCleanWronglyFlagged: number; maxDamageFoundDrop: number } | null) => ({
    id, completedAt: new Date(`2026-11-0${id}T10:00:00Z`), accepted, gatePassed: true, pipelineVersion: `v${id}`, measures: measures(wrong, found), gateLimits: limits,
  })

  it('draws each run’s limit for clean returns, and its floor for damage from the run accepted before it', () => {
    const trend = runTrend([run('1', true, 1, 36, null), run('2', false, 4, 30, { maxCleanWronglyFlagged: 0.05, maxDamageFoundDrop: 0.1 }), run('3', true, 2, 37, { maxCleanWronglyFlagged: 0.05, maxDamageFoundDrop: 0.1 })])
    expect(trend.map((each) => ({ id: each.id, cleanLimit: each.cleanLimit, damageFloor: each.damageFloor === null ? null : Math.round(each.damageFloor * 1000) / 1000 }))).toEqual([
      { id: '1', cleanLimit: null, damageFloor: null },
      { id: '2', cleanLimit: 0.05, damageFloor: 0.8 },
      { id: '3', cleanLimit: 0.05, damageFloor: 0.8 },
    ])
    expect(trend[1]).toMatchObject({ withinCleanLimit: false, aboveDamageFloor: false })
    expect(trend[2]).toMatchObject({ withinCleanLimit: true, aboveDamageFloor: true })
  })
})
