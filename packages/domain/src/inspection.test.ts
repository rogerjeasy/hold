import { describe, expect, it } from 'vitest'
import { inspectFindings } from './inspection.ts'
import fc from 'fast-check'

const region = { x: 0.2, y: 0.2, width: 0.2, height: 0.2 }
const damage = { view: 'left-side', region, class: 'new_damage' as const, confidence: 0.96, secondLookConfirmed: true }

describe('inspection outcomes', () => {
  it('never turns an unconfirmed damage observation into confirmed damage for any confidence', () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (confidence) => {
      expect(inspectFindings([{ ...damage, confidence, secondLookConfirmed: false }], []).state).toBe('deferred')
    }))
  })
  it('keeps independently confirmed damage for review, without deciding any charge', () => {
    expect(inspectFindings([damage], [])).toEqual({ state: 'findings', findings: [{ ...damage, matchedMarkId: null }] })
  })
  it('removes a known mark from consideration, only in its matching view', () => {
    expect(inspectFindings([damage], [{ id: 'known', view: 'left-side', region }])).toMatchObject({ state: 'clean', findings: [{ class: 'known_mark', matchedMarkId: 'known' }] })
    expect(inspectFindings([damage], [{ id: 'known', view: 'right-side', region }])).toMatchObject({ state: 'findings' })
  })
  it.each([{ ...damage, confidence: 0.5 }, { ...damage, secondLookConfirmed: false }, { ...damage, class: 'uncertain' as const }])('defers uncertainty even when another finding is confirmed', (finding) => {
    expect(inspectFindings([damage, finding], [])).toMatchObject({ state: 'deferred' })
  })
  it('treats ordinary wear and an empty set as clean', () => {
    expect(inspectFindings([{ ...damage, class: 'wear', secondLookConfirmed: null }], [])).toMatchObject({ state: 'clean' })
    expect(inspectFindings([], [])).toEqual({ state: 'clean', findings: [] })
  })
})
