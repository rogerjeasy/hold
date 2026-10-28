import type { EvaluatedCase } from '@hold/domain'
import { describe, expect, it } from 'vitest'
import { caseRows, verdictCounts } from './case-rows'

const box = (x: number) => ({ x, y: 0.4, width: 0.1, height: 0.1 })
const pair = (overrides: Partial<EvaluatedCase>): EvaluatedCase => ({
  id: 'case', group: 'damage', origin: 'real', view: 'frame-left', before: 'gate/b.jpg', after: 'gate/a.jpg', alignment: 0.93,
  labels: [{ kind: 'damage', region: box(0.4) }], knownMarks: [], state: 'findings', findings: [], milliseconds: 1000, inputTokens: 100, outputTokens: 10, ...overrides,
})

// Each pair of the accepted run as one row of the open scorecard's grid.
describe('the rows of the open scorecard', () => {
  it('speak of the most confident change the comparison claimed, at its level, with what the second look said', () => {
    const [row] = caseRows([pair({ findings: [
      { region: box(0.8), class: 'wear', confidence: 0.99, secondLookConfirmed: null },
      { region: box(0.41), class: 'new_damage', confidence: 0.95, secondLookConfirmed: true },
      { region: box(0.6), class: 'uncertain', confidence: 0.4, secondLookConfirmed: null },
    ] })])
    expect(row).toMatchObject({ verdict: 'pass', expected: 'findings', actual: 'findings', level: 'high', secondLook: 'confirmed' })
    expect(row?.lead?.class).toBe('new_damage')
  })

  it('say when no change was claimed, and when the second look was not asked or did not agree', () => {
    const [quiet, doubted] = caseRows([
      pair({ id: 'quiet', group: 'clean_easy', labels: [], state: 'clean', findings: [{ region: box(0.2), class: 'wear', confidence: 0.9, secondLookConfirmed: null }] }),
      pair({ id: 'doubted', state: 'deferred', findings: [{ region: box(0.41), class: 'new_damage', confidence: 0.92, secondLookConfirmed: false }] }),
    ])
    expect(quiet).toMatchObject({ lead: null, level: null, secondLook: 'not_asked', verdict: 'pass', expected: 'clean' })
    expect(doubted).toMatchObject({ secondLook: 'not_confirmed', verdict: 'pass' })
  })

  it('count the passes, failures and pairs sent to a person, for a group or all of them', () => {
    const rows = caseRows([pair({ id: 'a' }), pair({ id: 'b', state: 'clean' }), pair({ id: 'c', group: 'identity', labels: [], state: 'deferred' })])
    expect(verdictCounts(rows)).toEqual({ pass: 1, fail: 2, person: 0, total: 3 })
  })
})
