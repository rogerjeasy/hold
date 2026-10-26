import { describe, expect, it } from 'vitest'
import { outcomeOf } from './incident-outcome'

const sent = new Date('2026-10-20T09:00:00Z')

describe('what a renter is shown about their report', () => {
  it.each([
    [{ state: 'reported', kind: null, sentAt: null, offer: null }, 'photographs'],
    [{ state: 'reported', kind: null, sentAt: sent, offer: null }, 'stored'],
    [{ state: 'awaiting_staff', kind: 'unsafe_or_unclear', sentAt: sent, offer: null }, 'unsafe'],
    [{ state: 'claim_opened', kind: 'unsafe_or_unclear', sentAt: sent, offer: null }, 'unsafe'],
    [{ state: 'awaiting_staff', kind: 'theft_or_loss', sentAt: sent, offer: null }, 'theft'],
    [{ state: 'awaiting_staff', kind: 'mechanical_fault', sentAt: sent, offer: null }, 'fault'],
    [{ state: 'shop_matter', kind: 'mechanical_fault', sentAt: sent, offer: null }, 'fault'],
    [{ state: 'triaged', kind: 'small_damage', sentAt: sent, offer: null }, 'pricing'],
    [{ state: 'triaged', kind: 'small_damage', sentAt: sent, offer: { description: 'Scratch', amountCents: 3500, currency: 'EUR' } }, 'offer'],
    [{ state: 'agreed', kind: 'small_damage', sentAt: sent, offer: { description: 'Scratch', amountCents: 3500, currency: 'EUR' } }, 'agreed'],
    [{ state: 'awaiting_staff', kind: 'small_damage', sentAt: sent, offer: null }, 'return'],
    [{ state: 'resolved', kind: 'small_damage', sentAt: sent, offer: null }, 'resolved'],
  ] as const)('%o shows %s', (incident, outcome) => {
    expect(outcomeOf(incident)).toBe(outcome)
  })

  it('never offers a price on anything that could bear on safety, whatever else is recorded', () => {
    expect(outcomeOf({ state: 'triaged', kind: 'unsafe_or_unclear', sentAt: sent, offer: { description: 'Scratch', amountCents: 3500, currency: 'EUR' } })).toBe('unsafe')
  })
})
