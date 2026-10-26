import { describe, expect, it } from 'vitest'
import { incidentAlertEmail } from './incident-email.ts'

const facts = { shopName: 'Ribeira Bikes', itemLabel: 'City e-bike 3', kind: 'unsafe_or_unclear' as const, incidentsUrl: 'https://hold.test/shop/incidents' }

describe('the email that tells staff a renter reported something', () => {
  it('says which item, what kind of report, that a person is needed, and links to the incidents', () => {
    const email = incidentAlertEmail('ana@ribeira.example', 'en', facts)
    expect(email.to).toBe('ana@ribeira.example')
    expect(email.subject).toBe('A renter reported something: City e-bike 3')
    expect(email.text).toContain('could bear on safety')
    expect(email.text).toContain('https://hold.test/shop/incidents')
  })

  it('names every kind, in the staff member’s language, and never quotes the renter or an amount', () => {
    for (const kind of ['small_damage', 'mechanical_fault', 'theft_or_loss', 'unsafe_or_unclear', null] as const) {
      for (const language of ['en', 'fr', 'es', 'de']) {
        const email = incidentAlertEmail('a@b.example', language, { ...facts, kind })
        expect(email.text.length).toBeGreaterThan(40)
        expect(email.text).not.toMatch(/\d+[.,]\d{2}/)
      }
    }
    expect(incidentAlertEmail('a@b.example', 'de', facts).subject).toBe('Eine mietende Person hat etwas gemeldet: City e-bike 3')
    expect(incidentAlertEmail('a@b.example', 'pt', facts).subject).toBe('A renter reported something: City e-bike 3')
  })
})
