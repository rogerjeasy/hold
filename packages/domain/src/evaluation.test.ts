import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { checkGate, confidenceLevel, measureEvaluation, sharePercent, zeroUpperBound } from './evaluation.ts'
import type { EvaluatedCase, Measures } from './evaluation.ts'

const box = (x: number, y: number, size = 0.1) => ({ x, y, width: size, height: size })
const damage = (region = box(0.4, 0.4)) => ({ region, class: 'new_damage' as const, confidence: 0.95, secondLookConfirmed: true })
const pair = (overrides: Partial<EvaluatedCase>): EvaluatedCase => ({ id: 'case', group: 'clean_easy', origin: 'real', view: 'frame', before: 'gate/b.jpg', after: 'gate/a.jpg', alignment: 0.9, labels: [], knownMarks: [], state: 'clean', findings: [], milliseconds: 1000, inputTokens: 100, outputTokens: 10, ...overrides })

describe('measuring the comparison against the evaluation set', () => {
  it('counts labelled damage as found only when a damage finding overlaps its region', () => {
    const measures = measureEvaluation([
      pair({ id: 'found', group: 'damage', state: 'findings', labels: [{ kind: 'damage', region: box(0.4, 0.4) }], findings: [damage(box(0.42, 0.42))] }),
      pair({ id: 'wrong place', group: 'damage', state: 'findings', labels: [{ kind: 'damage', region: box(0.1, 0.1) }], findings: [damage(box(0.8, 0.8))] }),
      pair({ id: 'missed', group: 'damage', state: 'clean', labels: [{ kind: 'missing', region: box(0.5, 0.5) }] }),
    ])
    expect(measures.damageFound).toEqual({ count: 1, total: 3 })
  })

  // Found counts only damage the comparison confirmed. A pair sent to a person is not a miss: a person decides it.
  // The miss that matters is damage the comparison called clean, which nobody would look at again.
  it('counts labelled damage as passed as clean only when its pair ended clean', () => {
    const measures = measureEvaluation([
      pair({ id: 'found', group: 'damage', state: 'findings', labels: [{ kind: 'damage', region: box(0.4, 0.4) }], findings: [damage(box(0.42, 0.42))] }),
      pair({ id: 'to a person', group: 'damage', state: 'deferred', labels: [{ kind: 'damage', region: box(0.4, 0.4) }] }),
      pair({ id: 'missed', group: 'damage', state: 'clean', labels: [{ kind: 'damage', region: box(0.5, 0.5) }] }),
    ])
    expect(measures.damagePassedAsClean).toEqual({ count: 1, total: 3 })
  })

  it('counts a clean pair that ended in findings as wrongly flagged, and ordinary wear as clean', () => {
    const measures = measureEvaluation([
      pair({ group: 'clean_easy', state: 'clean' }),
      pair({ group: 'clean_hard', state: 'findings', findings: [damage()] }),
      pair({ group: 'wear', state: 'deferred' }),
    ])
    expect(measures.cleanWronglyFlagged).toEqual({ count: 1, total: 3 })
  })

  it('reports deferral on its own, counted over every pair', () => {
    const measures = measureEvaluation([pair({ state: 'deferred' }), pair({ group: 'damage', state: 'findings' }), pair({ state: 'clean' })])
    expect(measures.sentToPerson).toEqual({ count: 1, total: 3 })
  })

  it('respects a known mark when no damage finding lands on it', () => {
    const measures = measureEvaluation([
      pair({ group: 'known_mark', knownMarks: [box(0.2, 0.2)], findings: [{ ...damage(box(0.2, 0.2)), class: 'known_mark' }] }),
      pair({ group: 'known_mark', knownMarks: [box(0.6, 0.6)], state: 'findings', findings: [damage(box(0.61, 0.61))] }),
    ])
    expect(measures.knownMarksRespected).toEqual({ count: 1, total: 2 })
  })

  it('measures agreement between the two looks over damage findings from the first look', () => {
    const measures = measureEvaluation([pair({ group: 'damage', findings: [damage(), { ...damage(), secondLookConfirmed: false }, { ...damage(), class: 'wear', secondLookConfirmed: null }] })])
    expect(measures.looksAgree).toEqual({ count: 1, total: 2 })
  })

  it('counts a wrong item or reused photograph as caught when it went to a person', () => {
    const measures = measureEvaluation([pair({ group: 'identity', state: 'deferred' }), pair({ group: 'identity', state: 'clean' })])
    expect(measures.identityCaught).toEqual({ count: 1, total: 2 })
  })

  it('says, for each confidence level, how many findings at that level were correct', () => {
    const measures = measureEvaluation([
      pair({ group: 'damage', labels: [{ kind: 'damage', region: box(0.4, 0.4) }], findings: [damage(), { ...damage(box(0.8, 0.8)), confidence: 0.75, class: 'uncertain' }] }),
      pair({ group: 'clean_easy', findings: [{ ...damage(box(0.1, 0.1)), confidence: 0.5 }] }),
    ])
    expect(measures.confidence).toEqual({ high: { count: 1, total: 1 }, medium: { count: 0, total: 1 }, low: { count: 0, total: 1 } })
  })

  it('gives the median and slowest tenth of time and tokens', () => {
    const measures = measureEvaluation([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seconds) => pair({ milliseconds: seconds * 1000, inputTokens: seconds, outputTokens: seconds })))
    expect(measures.milliseconds).toEqual({ median: 5500, slowestTenth: 10000 })
    expect(measures.tokens).toEqual({ median: 11, slowestTenth: 20 })
  })

  it('never counts a share above its total', () => {
    fc.assert(fc.property(fc.array(fc.record({ group: fc.constantFrom('clean_easy', 'clean_hard', 'wear', 'damage', 'known_mark', 'identity'), state: fc.constantFrom('clean', 'findings', 'deferred') }), { maxLength: 40 }), (cases) => {
      const measures = measureEvaluation(cases.map((each, index) => pair({ id: String(index), group: each.group, state: each.state })))
      for (const share of [measures.damageFound, measures.cleanWronglyFlagged, measures.sentToPerson, measures.knownMarksRespected, measures.identityCaught]) expect(share.count).toBeLessThanOrEqual(share.total)
    }))
  })
})

describe('what a count of zero can support', () => {
  it('bounds sixty clean pairs with none wrongly flagged below about six percent', () => {
    expect(zeroUpperBound(60)).toBeCloseTo(0.0596, 3)
  })

  it('supports nothing when nothing was tested', () => {
    expect(zeroUpperBound(0)).toBe(1)
  })
})

describe('confidence levels', () => {
  it('names the level a finding was reported at', () => {
    expect([confidenceLevel(0.95), confidenceLevel(0.9), confidenceLevel(0.8), confidenceLevel(0.3)]).toEqual(['high', 'high', 'medium', 'low'])
  })
})

describe('the release gate', () => {
  const measures = (wrong: number, found: number): Measures => ({ ...measureEvaluation([]), cleanWronglyFlagged: { count: wrong, total: 60 }, damageFound: { count: found, total: 40 } })
  const limits = { maxCleanWronglyFlagged: 0.05, maxDamageFoundDrop: 0.05 }

  // With nothing accepted there is nothing to be worse than: the run sets no bar and proves nothing, and says so.
  it('has no baseline to measure the first run against, and says so rather than passing it', () => {
    expect(checkGate({ current: measures(10, 10), accepted: null, limits })).toEqual({ outcome: 'no_baseline', reasons: [] })
  })

  it('fails when clean returns wrongly flagged rise above the limit', () => {
    expect(checkGate({ current: measures(4, 36), accepted: measures(1, 36), limits })).toEqual({ outcome: 'failed', reasons: ['clean_wrongly_flagged_above_limit'] })
  })

  it('fails when damage found falls by more than the tolerance against the last accepted run', () => {
    expect(checkGate({ current: measures(1, 30), accepted: measures(1, 36), limits })).toEqual({ outcome: 'failed', reasons: ['damage_found_fell'] })
  })

  it('passes a run that holds both lines', () => {
    expect(checkGate({ current: measures(2, 35), accepted: measures(1, 36), limits })).toEqual({ outcome: 'passed', reasons: [] })
  })

  // X0.4, shown on the gate rule itself: the same pairs, measured once as the accepted run saw them and once as a
  // weakened prompt would answer, missing small marks and calling shadows damage. No live run is involved.
  it('fails a run measurably worse than the accepted one, on the pairs themselves, with both reasons', () => {
    const labelled = (index: number) => ({ id: `damage-${String(index)}`, group: 'damage' as const, labels: [{ kind: 'damage' as const, region: box(0.4, 0.4) }] })
    const clean = (index: number) => ({ id: `clean-${String(index)}`, group: 'clean_hard' as const })
    const accepted = measureEvaluation([
      ...Array.from({ length: 10 }, (_, index) => pair({ ...labelled(index), state: 'findings', findings: [damage(box(0.42, 0.42))] })),
      ...Array.from({ length: 10 }, (_, index) => pair({ ...clean(index), state: 'clean' })),
    ])
    const weakened = measureEvaluation([
      ...Array.from({ length: 10 }, (_, index) => (index < 6 ? pair({ ...labelled(index), state: 'findings', findings: [damage(box(0.42, 0.42))] }) : pair({ ...labelled(index), state: 'clean' }))),
      ...Array.from({ length: 10 }, (_, index) => (index < 3 ? pair({ ...clean(index), state: 'findings', findings: [damage(box(0.7, 0.7))] }) : pair({ ...clean(index), state: 'clean' }))),
    ])
    expect(checkGate({ current: weakened, accepted, limits: { maxCleanWronglyFlagged: 0.2, maxDamageFoundDrop: 0.15 } })).toEqual({ outcome: 'failed', reasons: ['clean_wrongly_flagged_above_limit', 'damage_found_fell'] })
    expect(checkGate({ current: accepted, accepted, limits: { maxCleanWronglyFlagged: 0.2, maxDamageFoundDrop: 0.15 } })).toEqual({ outcome: 'passed', reasons: [] })
  })
})

describe('printing a share', () => {
  it('rounds to a whole percent, the same everywhere the figure appears', () => {
    expect([sharePercent({ count: 57, total: 60 }), sharePercent({ count: 1, total: 3 }), sharePercent({ count: 0, total: 0 })]).toEqual([95, 33, 0])
  })
})
