import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { checkKeptLine, INCIDENT_HINTS, INCIDENT_KINDS, INCIDENT_LIMITS, INCIDENT_STATES, INCIDENT_TRANSITIONS, mayAgree, mayConfirmOffer, mayMakeShopMatter, sortIncident } from './incident.ts'
import type { IncidentKind, IncidentTriage } from './incident.ts'
import { money } from './money.ts'

const scratch = { hint: 'damage' as const, description: 'A scratch on the left side', priceCodes: ['deep-scratch-on-the-frame'], photographed: true }
const confident = (kind: IncidentKind, priceCode: string | null = null): IncidentTriage => ({ kind, confidence: 0.95, priceCode })

describe('the incident machine', () => {
  it('moves exactly as extensions.md section 10.5 draws it', () => {
    expect(INCIDENT_TRANSITIONS).toEqual({
      reported: ['triaged', 'withdrawn'],
      triaged: ['agreed', 'shop_matter', 'awaiting_staff', 'withdrawn'],
      awaiting_staff: ['agreed', 'shop_matter', 'claim_opened'],
      agreed: ['resolved'],
      shop_matter: ['resolved'],
      claim_opened: ['resolved'],
      resolved: [],
      withdrawn: [],
    })
    expect([...INCIDENT_STATES].sort()).toEqual(Object.keys(INCIDENT_TRANSITIONS).sort())
  })

  it('has the four kinds and lets the renter say they are not sure', () => {
    expect(INCIDENT_KINDS).toEqual(['small_damage', 'mechanical_fault', 'theft_or_loss', 'unsafe_or_unclear'])
    expect(INCIDENT_HINTS).toEqual(['damage', 'fault', 'gone', 'unsafe', 'not_sure'])
  })
})

describe('sorting a report', () => {
  it('suggests a listed price for small damage when the model matched one with confidence and there is a photograph', () => {
    expect(sortIncident({ ...scratch, triage: confident('small_damage', 'deep-scratch-on-the-frame') })).toEqual({ kind: 'small_damage', next: 'triaged', suggestedCode: 'deep-scratch-on-the-frame', safety: false })
  })

  it('sends small damage to a person without a listed price, a photograph or confidence', () => {
    expect(sortIncident({ ...scratch, triage: confident('small_damage', 'made-up-code') })).toMatchObject({ kind: 'small_damage', next: 'awaiting_staff', suggestedCode: null })
    expect(sortIncident({ ...scratch, photographed: false, triage: confident('small_damage', 'deep-scratch-on-the-frame') })).toMatchObject({ next: 'awaiting_staff', suggestedCode: null })
    expect(sortIncident({ ...scratch, triage: { kind: 'small_damage', confidence: INCIDENT_LIMITS.minConfidence - 0.01, priceCode: 'deep-scratch-on-the-frame' } })).toMatchObject({ kind: 'unsafe_or_unclear', next: 'awaiting_staff', suggestedCode: null })
  })

  it('sends a fault and a theft to a person: a fault becomes the shop’s matter only when staff confirm it', () => {
    expect(sortIncident({ ...scratch, hint: 'fault', description: 'The battery will not charge', triage: confident('mechanical_fault') })).toMatchObject({ kind: 'mechanical_fault', next: 'awaiting_staff' })
    expect(sortIncident({ ...scratch, hint: 'gone', description: 'It was taken', photographed: false, triage: confident('theft_or_loss') })).toMatchObject({ kind: 'theft_or_loss', next: 'awaiting_staff' })
    expect(mayMakeShopMatter({ state: 'awaiting_staff' })).toBe(true)
    expect(mayMakeShopMatter({ state: 'triaged' })).toBe(false)
  })

  it('never lets the model turn the renter’s damage into the shop’s matter, or the reverse: a disagreement is unclear', () => {
    expect(sortIncident({ ...scratch, triage: confident('mechanical_fault') })).toMatchObject({ kind: 'unsafe_or_unclear', next: 'awaiting_staff', suggestedCode: null })
    expect(sortIncident({ ...scratch, hint: 'fault', triage: confident('small_damage', 'deep-scratch-on-the-frame') })).toMatchObject({ kind: 'unsafe_or_unclear', next: 'awaiting_staff', suggestedCode: null })
    expect(sortIncident({ ...scratch, hint: 'fault', triage: confident('theft_or_loss') })).toMatchObject({ kind: 'unsafe_or_unclear', next: 'awaiting_staff' })
  })

  it('routes words about safety to a person whatever the model says', () => {
    expect(sortIncident({ ...scratch, description: 'Scratch after I fell, my knee is bleeding', triage: confident('small_damage', 'deep-scratch-on-the-frame') })).toEqual({ kind: 'unsafe_or_unclear', next: 'awaiting_staff', suggestedCode: null, safety: true })
  })

  it('routes a renter who says it is unsafe, or is not sure, to a person', () => {
    for (const hint of ['unsafe', 'not_sure'] as const) expect(sortIncident({ ...scratch, hint, triage: confident('small_damage', 'deep-scratch-on-the-frame') })).toMatchObject({ kind: 'unsafe_or_unclear', next: 'awaiting_staff' })
  })

  it('still sorts with the model unavailable, sending every report to a person', () => {
    expect(sortIncident({ ...scratch, triage: null })).toMatchObject({ kind: 'unsafe_or_unclear', next: 'awaiting_staff', suggestedCode: null })
    expect(sortIncident({ ...scratch, hint: 'fault', triage: null })).toMatchObject({ kind: 'mechanical_fault', next: 'awaiting_staff' })
    expect(sortIncident({ ...scratch, hint: 'gone', triage: null })).toMatchObject({ kind: 'theft_or_loss', next: 'awaiting_staff' })
  })

  it('lets the model only confirm what code decided, or make it unclear, whatever it answers', () => {
    fc.assert(fc.property(
      fc.constantFrom(...INCIDENT_HINTS), fc.constantFrom(...INCIDENT_KINDS), fc.double({ min: 0, max: 1, noNaN: true }), fc.constantFrom('deep-scratch-on-the-frame', null), fc.boolean(), fc.constantFrom('A scratch', 'My friend is hurt'),
      (hint, kind, confidence, priceCode, photographed, description) => {
        const sorted = sortIncident({ ...scratch, hint, description, photographed, triage: { kind, confidence, priceCode } })
        const byCode = { damage: 'small_damage', fault: 'mechanical_fault', gone: 'theft_or_loss', unsafe: 'unsafe_or_unclear', not_sure: 'unsafe_or_unclear' }[hint]
        expect([byCode, 'unsafe_or_unclear']).toContain(sorted.kind)
        if (sorted.safety) expect(sorted.kind).toBe('unsafe_or_unclear')
        if (sorted.next === 'triaged') expect(sorted).toMatchObject({ kind: 'small_damage', suggestedCode: 'deep-scratch-on-the-frame' })
        expect(sorted.next).not.toBe('shop_matter')
      },
    ))
  })
})

describe('agreeing small damage', () => {
  it('needs a staff member to confirm the price first: the model only suggests it', () => {
    expect(mayConfirmOffer({ state: 'triaged', kind: 'small_damage' })).toBe(true)
    expect(mayConfirmOffer({ state: 'triaged', kind: 'mechanical_fault' })).toBe(false)
    expect(mayConfirmOffer({ state: 'awaiting_staff', kind: 'small_damage' })).toBe(false)
    expect(mayAgree({ state: 'triaged', kind: 'small_damage', offeredPriceEntryId: 'price', offerConfirmedByUserId: 'staff' })).toBe(true)
    expect(mayAgree({ state: 'triaged', kind: 'small_damage', offeredPriceEntryId: 'price', offerConfirmedByUserId: null })).toBe(false)
    expect(mayAgree({ state: 'triaged', kind: 'small_damage', offeredPriceEntryId: null, offerConfirmedByUserId: null })).toBe(false)
    expect(mayAgree({ state: 'triaged', kind: 'mechanical_fault', offeredPriceEntryId: 'price', offerConfirmedByUserId: 'staff' })).toBe(false)
    expect(mayAgree({ state: 'awaiting_staff', kind: 'small_damage', offeredPriceEntryId: 'price', offerConfirmedByUserId: 'staff' })).toBe(false)
  })
})

describe('the agreed line at the return', () => {
  const agreed = money(35_00, 'EUR')
  it('may be kept or lowered by staff', () => {
    expect(checkKeptLine(agreed, money(35_00, 'EUR'))).toEqual({ ok: true, value: agreed })
    expect(checkKeptLine(agreed, money(20_00, 'EUR'))).toEqual({ ok: true, value: money(20_00, 'EUR') })
  })
  it('may never be raised, or kept at nothing', () => {
    fc.assert(fc.property(fc.integer({ min: 35_01, max: 10_000_000 }), (cents) => {
      expect(checkKeptLine(agreed, money(cents, 'EUR'))).toEqual({ ok: false, error: 'raises_agreed_line' })
    }))
    expect(checkKeptLine(agreed, money(0, 'EUR'))).toEqual({ ok: false, error: 'empty_line' })
  })
})
