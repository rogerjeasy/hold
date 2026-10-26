import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { checkKeptLine, INCIDENT_HINTS, INCIDENT_KINDS, INCIDENT_LIMITS, INCIDENT_STATES, INCIDENT_TRANSITIONS, mayAgree, sortIncident } from './incident.ts'
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
  it('offers small damage at a listed price when the model matched one with confidence and there is a photograph', () => {
    expect(sortIncident({ ...scratch, triage: confident('small_damage', 'deep-scratch-on-the-frame') })).toEqual({ kind: 'small_damage', next: 'triaged', priceCode: 'deep-scratch-on-the-frame', safety: false })
  })

  it('sends small damage to a person without a listed price, a photograph or confidence', () => {
    expect(sortIncident({ ...scratch, triage: confident('small_damage', 'made-up-code') })).toMatchObject({ kind: 'small_damage', next: 'awaiting_staff', priceCode: null })
    expect(sortIncident({ ...scratch, photographed: false, triage: confident('small_damage', 'deep-scratch-on-the-frame') })).toMatchObject({ next: 'awaiting_staff', priceCode: null })
    expect(sortIncident({ ...scratch, triage: { kind: 'small_damage', confidence: INCIDENT_LIMITS.minConfidence - 0.01, priceCode: 'deep-scratch-on-the-frame' } })).toMatchObject({ kind: 'unsafe_or_unclear', next: 'awaiting_staff', priceCode: null })
  })

  it('makes a fault the shop’s matter and a theft a person’s', () => {
    expect(sortIncident({ ...scratch, hint: 'fault', description: 'The battery will not charge', triage: confident('mechanical_fault') })).toMatchObject({ kind: 'mechanical_fault', next: 'shop_matter' })
    expect(sortIncident({ ...scratch, hint: 'gone', description: 'It was taken', photographed: false, triage: confident('theft_or_loss') })).toMatchObject({ kind: 'theft_or_loss', next: 'awaiting_staff' })
  })

  it('routes words about safety to a person whatever the model says', () => {
    expect(sortIncident({ ...scratch, description: 'Scratch after I fell, my knee is bleeding', triage: confident('small_damage', 'deep-scratch-on-the-frame') })).toEqual({ kind: 'unsafe_or_unclear', next: 'awaiting_staff', priceCode: null, safety: true })
  })

  it('routes a renter who says it is unsafe, or is not sure, to a person', () => {
    for (const hint of ['unsafe', 'not_sure'] as const) expect(sortIncident({ ...scratch, hint, triage: confident('small_damage', 'deep-scratch-on-the-frame') })).toMatchObject({ kind: 'unsafe_or_unclear', next: 'awaiting_staff' })
  })

  it('reads two different kinds of equal weight as unclear', () => {
    expect(sortIncident({ ...scratch, hint: 'fault', triage: confident('theft_or_loss') })).toMatchObject({ kind: 'unsafe_or_unclear', next: 'awaiting_staff' })
  })

  it('still sorts with the model unavailable, sending anything not plainly a fault or a theft to a person', () => {
    expect(sortIncident({ ...scratch, triage: null })).toMatchObject({ kind: 'unsafe_or_unclear', next: 'awaiting_staff', priceCode: null })
    expect(sortIncident({ ...scratch, hint: 'fault', triage: null })).toMatchObject({ kind: 'mechanical_fault', next: 'shop_matter' })
    expect(sortIncident({ ...scratch, hint: 'gone', triage: null })).toMatchObject({ kind: 'theft_or_loss', next: 'awaiting_staff' })
  })

  it('lets the model make the routing more cautious, never less, whatever it answers', () => {
    const rank = { small_damage: 0, mechanical_fault: 1, theft_or_loss: 1, unsafe_or_unclear: 2 } as const
    fc.assert(fc.property(
      fc.constantFrom(...INCIDENT_HINTS), fc.constantFrom(...INCIDENT_KINDS), fc.double({ min: 0, max: 1, noNaN: true }), fc.constantFrom('deep-scratch-on-the-frame', null), fc.boolean(),
      (hint, kind, confidence, priceCode, photographed) => {
        const withoutModel = sortIncident({ ...scratch, hint, photographed, triage: null })
        const withModel = sortIncident({ ...scratch, hint, photographed, triage: { kind, confidence, priceCode } })
        // Without the model, a renter's "damage" is already unclear; the model may only turn it into small damage.
        if (withoutModel.kind !== 'unsafe_or_unclear') expect(rank[withModel.kind]).toBeGreaterThanOrEqual(rank[withoutModel.kind])
        if (withModel.kind === 'small_damage') expect(hint).toBe('damage')
        if (withModel.next === 'triaged') expect(withModel).toMatchObject({ kind: 'small_damage', priceCode: 'deep-scratch-on-the-frame' })
      },
    ))
  })
})

describe('agreeing small damage', () => {
  it('needs a sorted small damage report with a price offered', () => {
    expect(mayAgree({ state: 'triaged', kind: 'small_damage', offeredPriceEntryId: 'price' })).toBe(true)
    expect(mayAgree({ state: 'triaged', kind: 'small_damage', offeredPriceEntryId: null })).toBe(false)
    expect(mayAgree({ state: 'triaged', kind: 'mechanical_fault', offeredPriceEntryId: 'price' })).toBe(false)
    expect(mayAgree({ state: 'awaiting_staff', kind: 'small_damage', offeredPriceEntryId: 'price' })).toBe(false)
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
