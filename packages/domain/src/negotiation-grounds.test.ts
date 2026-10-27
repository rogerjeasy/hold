import { describe, expect, it } from 'vitest'
import { checkGround, lineFacts, wearClauses } from './negotiation-grounds.ts'

const region = { x: 0.4, y: 0.4, width: 0.1, height: 0.1 }
const finding = { id: 'finding-1', view: 'left-side', region, confidence: 0.97, secondLookConfirmed: true as boolean | null, alignment: 0.99 as number | null }

describe('the facts code reads for each claim line', () => {
  it('finds a known mark on the same view, first seen before this rental, near the finding', () => {
    const near = { id: 'mark-1', view: 'left-side', region: { x: 0.52, y: 0.4, width: 0.05, height: 0.05 }, seenBeforeRental: true }
    expect(lineFacts({ lineId: 'line-1', publishedCents: 35_00, finding, marks: [near], wearRules: '' }).knownMarks).toEqual(['mark-1'])
    for (const mark of [{ ...near, view: 'right-side' }, { ...near, seenBeforeRental: false }, { ...near, region: { x: 0.8, y: 0.8, width: 0.05, height: 0.05 } }]) {
      expect(lineFacts({ lineId: 'line-1', publishedCents: 35_00, finding, marks: [mark], wearRules: '' }).knownMarks).toEqual([])
    }
  })

  it('calls a finding uncertain below the highest confidence, with a poor alignment, or when the second look did not confirm it', () => {
    const facts = (changes: Partial<typeof finding>) => lineFacts({ lineId: 'line-1', publishedCents: 35_00, finding: { ...finding, ...changes }, marks: [], wearRules: '' })
    expect(facts({})).toMatchObject({ uncertain: false, bothLooksConfirmed: true })
    expect(facts({ confidence: 0.89 }).uncertain).toBe(true)
    expect(facts({ alignment: 0.93 }).uncertain).toBe(true)
    expect(facts({ alignment: null }).uncertain).toBe(true)
    expect(facts({ secondLookConfirmed: false })).toMatchObject({ uncertain: true, bothLooksConfirmed: false })
  })

  it('treats a line a person added without a finding as having no photograph evidence either way', () => {
    expect(lineFacts({ lineId: 'line-2', publishedCents: 15_00, finding: null, marks: [], wearRules: '' })).toMatchObject({ uncertain: false, bothLooksConfirmed: false, knownMarks: [] })
  })

  it('numbers the wear policy’s clauses, one per written line', () => {
    expect(wearClauses('Scuffs under 2 cm are wear.\n\n  Tyre wear is expected.  ')).toEqual([{ id: 'wear-1', text: 'Scuffs under 2 cm are wear.' }, { id: 'wear-2', text: 'Tyre wear is expected.' }])
  })
})

describe('a ground, checked by code', () => {
  const facts = lineFacts({ lineId: 'line-1', publishedCents: 35_00, finding: { ...finding, confidence: 0.8 }, marks: [{ id: 'mark-1', view: 'left-side', region, seenBeforeRental: true }], wearRules: 'Scuffs are wear.' })
  const claim = { renterPhotoIds: ['photo-9'], goodwillAllowed: false }

  it('accepts each ground whose check passes, citing what it rests on', () => {
    expect(checkGround({ side: 'renter', ground: 'known_mark', evidence: ['mark-1'] }, facts, claim)).toEqual({ ok: true })
    expect(checkGround({ side: 'renter', ground: 'uncertain_evidence', evidence: [] }, facts, claim)).toEqual({ ok: true })
    expect(checkGround({ side: 'renter', ground: 'ordinary_wear', evidence: ['wear-1'] }, facts, claim)).toEqual({ ok: true })
    expect(checkGround({ side: 'renter', ground: 'renter_photo', evidence: ['photo-9'] }, facts, claim)).toEqual({ ok: true })
  })

  it('refuses a ground whose check fails or whose evidence is not this rental’s', () => {
    expect(checkGround({ side: 'renter', ground: 'known_mark', evidence: ['mark-2'] }, facts, claim)).toEqual({ ok: false, reason: 'ground_check_failed' })
    expect(checkGround({ side: 'renter', ground: 'ordinary_wear', evidence: ['wear-7'] }, facts, claim)).toEqual({ ok: false, reason: 'ground_check_failed' })
    expect(checkGround({ side: 'renter', ground: 'renter_photo', evidence: ['photo-1'] }, facts, claim)).toEqual({ ok: false, reason: 'ground_check_failed' })
    expect(checkGround({ side: 'shop', ground: 'evidence_stands', evidence: [] }, facts, claim)).toEqual({ ok: false, reason: 'ground_check_failed' })
    expect(checkGround({ side: 'renter', ground: 'uncertain_evidence', evidence: [] }, lineFacts({ lineId: 'line-1', publishedCents: 35_00, finding, marks: [], wearRules: '' }), claim)).toEqual({ ok: false, reason: 'ground_check_failed' })
  })

  it('keeps evidence_stands and goodwill to the shop, and goodwill only where its mandate allows it', () => {
    const confirmed = lineFacts({ lineId: 'line-1', publishedCents: 35_00, finding, marks: [], wearRules: '' })
    expect(checkGround({ side: 'shop', ground: 'evidence_stands', evidence: [] }, confirmed, claim)).toEqual({ ok: true })
    expect(checkGround({ side: 'renter', ground: 'evidence_stands', evidence: [] }, confirmed, claim)).toEqual({ ok: false, reason: 'ground_not_for_side' })
    expect(checkGround({ side: 'shop', ground: 'goodwill', evidence: [] }, confirmed, claim)).toEqual({ ok: false, reason: 'goodwill_not_allowed' })
    expect(checkGround({ side: 'shop', ground: 'goodwill', evidence: [] }, confirmed, { ...claim, goodwillAllowed: true })).toEqual({ ok: true })
    // The renter's advocate never learns the shop's choice by trying.
    expect(checkGround({ side: 'renter', ground: 'goodwill', evidence: [] }, confirmed, { ...claim, goodwillAllowed: true })).toEqual({ ok: false, reason: 'ground_not_for_side' })
  })
})
