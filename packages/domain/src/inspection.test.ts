import { describe, expect, it } from 'vitest'
import { checkReportedRegion, INSPECTION_LIMITS, inspectFindings, unaccountedCandidates } from './inspection.ts'
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

describe('marks reported during this rental (comparison step 7)', () => {
  const reported = { id: 'reported', view: 'left-side', region: { x: 0.18, y: 0.18, width: 0.24, height: 0.24 }, covered: true }
  it('labels damage inside a mark the renter agreed to as reported, linked to that mark', () => {
    expect(inspectFindings([damage], [], [reported])).toEqual({ state: 'clean', findings: [{ ...damage, class: 'reported', matchedMarkId: 'reported' }] })
  })
  it('sends damage that has grown beyond the reported mark to a person, still linked', () => {
    const grown = { ...damage, region: { x: 0.1, y: 0.1, width: 0.6, height: 0.6 } }
    expect(inspectFindings([grown], [], [reported])).toEqual({ state: 'deferred', findings: [{ ...grown, class: 'uncertain', matchedMarkId: 'reported' }] })
  })
  it('keeps a reported mark that nobody agreed to as ordinary damage, linked for the person who decides', () => {
    expect(inspectFindings([damage], [], [{ ...reported, covered: false }])).toEqual({ state: 'findings', findings: [{ ...damage, matchedMarkId: 'reported' }] })
  })
  it('never makes a reported mark old: it is not a known mark, and other views are untouched', () => {
    expect(inspectFindings([damage], [], [{ ...reported, view: 'right-side' }])).toMatchObject({ state: 'findings', findings: [{ class: 'new_damage', matchedMarkId: null }] })
  })
  it('never lets a large reported region absorb other damage inside it: the match must hold both ways', () => {
    const wide = { ...reported, region: { x: 0.1, y: 0.1, width: 0.45, height: 0.45 } }
    expect(inspectFindings([damage], [], [wide])).toEqual({ state: 'deferred', findings: [{ ...damage, class: 'uncertain', matchedMarkId: 'reported' }] })
  })
  it('never covers anything with a region larger than the cap, whatever overlaps it', () => {
    const huge = { ...reported, region: { x: 0, y: 0, width: 1, height: 1 } }
    expect(checkReportedRegion(huge.region)).toBe(false)
    fc.assert(fc.property(fc.double({ min: 0, max: 0.79, noNaN: true }), fc.double({ min: 0, max: 0.79, noNaN: true }), fc.double({ min: 0.01, max: 0.2, noNaN: true }), (x, y, side) => {
      const finding = { ...damage, region: { x, y, width: side, height: side } }
      expect(inspectFindings([finding], [], [huge]).findings[0]?.class).not.toBe('reported')
    }))
  })
  it('accepts reported regions up to the cap only', () => {
    expect(checkReportedRegion({ x: 0, y: 0, width: 0.5, height: INSPECTION_LIMITS.maxReportedArea / 0.5 })).toBe(true)
    expect(checkReportedRegion({ x: 0, y: 0, width: 0.5, height: INSPECTION_LIMITS.maxReportedArea / 0.5 + 0.02 })).toBe(false)
    expect(checkReportedRegion({ x: 0.9, y: 0.9, width: 0.2, height: 0.05 })).toBe(false)
  })
  it('lets a mark from before the rental win, as it always did', () => {
    expect(inspectFindings([damage], [{ id: 'known', view: 'left-side', region }], [reported])).toMatchObject({ findings: [{ class: 'known_mark', matchedMarkId: 'known' }] })
  })
})

// Code finds the candidate areas and the model may not pass over one: it reports a finding over it or dismisses it.
describe('the candidate areas code found', () => {
  const elsewhere = { x: 0.7, y: 0.7, width: 0.1, height: 0.1 }

  it('are accounted for by a finding over them, of any class, or by a dismissal of their index', () => {
    expect(unaccountedCandidates([region], [{ region: { ...region, x: 0.3 } }], [])).toEqual([])
    expect(unaccountedCandidates([region, elsewhere], [], [0, 1])).toEqual([])
  })

  it('leave every one the model neither reported nor dismissed, in order', () => {
    expect(unaccountedCandidates([region, elsewhere], [], [])).toEqual([region, elsewhere])
    expect(unaccountedCandidates([region, elsewhere], [{ region }], [])).toEqual([elsewhere])
    // A dismissal names a candidate by its index; one naming no candidate dismisses nothing.
    expect(unaccountedCandidates([region], [], [1])).toEqual([region])
  })

  it('never lets a candidate go unaccounted unless some finding touches it or its index is dismissed', () => {
    const area = fc.record({ x: fc.double({ min: 0, max: 0.8, noNaN: true }), y: fc.double({ min: 0, max: 0.8, noNaN: true }), width: fc.double({ min: 0.01, max: 0.2, noNaN: true }), height: fc.double({ min: 0.01, max: 0.2, noNaN: true }) })
    fc.assert(fc.property(fc.array(area, { maxLength: 8 }), fc.array(area, { maxLength: 8 }), fc.array(fc.nat({ max: 9 }), { maxLength: 8 }), (candidates, findings, dismissed) => {
      const left = unaccountedCandidates(candidates, findings.map((each) => ({ region: each })), dismissed)
      candidates.forEach((candidate, index) => {
        const touched = findings.some((each) => each.x < candidate.x + candidate.width && candidate.x < each.x + each.width && each.y < candidate.y + candidate.height && candidate.y < each.y + each.height)
        expect(left.includes(candidate)).toBe(!touched && !dismissed.includes(index))
      })
    }))
  })
})
