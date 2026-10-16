import { describe, expect, it } from 'vitest'
import { holdExpiredEmail, holdOrderDescription, holdReplacementEmail } from './hold-emails.ts'

const facts = { shopName: 'Ribeira Bikes', renter: 'Priya Natarajan', amount: { cents: 300_00, currency: 'EUR' }, rentalUrl: 'https://hold.test/shop/rentals/r-1' }

describe('the email that tells an owner a hold expired', () => {
  it('says which rental, how much is no longer held, what that means for a claim, and links to the rental', () => {
    const email = holdExpiredEmail('ana@ribeira.example', 'en', facts)
    expect(email.to).toBe('ana@ribeira.example')
    expect(email.subject).toBe('A hold expired: Priya Natarajan')
    expect(email.text).toContain('€300.00')
    expect(email.text).toContain('Ribeira Bikes')
    expect(email.text).toContain('invoice')
    expect(email.text).toContain('https://hold.test/shop/rentals/r-1')
  })

  it('is written in the owner’s language, with the shop’s amount in its currency', () => {
    expect(holdExpiredEmail('a@b.example', 'de', facts).subject).toBe('Eine Reservierung ist abgelaufen: Priya Natarajan')
    expect(holdExpiredEmail('a@b.example', 'de', facts).text).toContain('300,00')
    expect(holdExpiredEmail('a@b.example', 'fr', facts).subject).toBe('Une empreinte a expiré : Priya Natarajan')
    expect(holdExpiredEmail('a@b.example', 'es', facts).subject).toBe('Una retención ha caducado: Priya Natarajan')
  })

  it('falls back to English for a language Hold does not speak', () => {
    expect(holdExpiredEmail('a@b.example', 'pt', facts).subject).toBe('A hold expired: Priya Natarajan')
  })
})

describe('the words PayPal shows a renter approving a hold', () => {
  it('say it is a refundable hold at the shop, not a charge, in the renter’s language', () => {
    expect(holdOrderDescription('en', 'Ribeira Bikes')).toBe('Refundable hold for your rental at Ribeira Bikes. Not a charge.')
    expect(holdOrderDescription('de', 'Ribeira Bikes')).toBe('Rückzahlbare Reservierung für Ihre Miete bei Ribeira Bikes. Keine Abbuchung.')
    expect(holdOrderDescription('xx', 'Ribeira Bikes')).toBe('Refundable hold for your rental at Ribeira Bikes. Not a charge.')
  })
})

describe('the email that asks a renter for a new hold', () => {
  const ask = { shopName: 'Ribeira Bikes', amount: { cents: 300_00, currency: 'EUR' }, approveUrl: 'https://hold.test/r/abc/pay', endsOn: 'Nov 14' }

  it('says the hold is ending, that the new one is not a charge, when the old one ends, and links to approve it', () => {
    const email = holdReplacementEmail('priya@example.com', 'en', ask)
    expect(email.subject).toBe('Please approve a new hold for your rental at Ribeira Bikes')
    expect(email.text).toContain('€300.00')
    expect(email.text).toContain('Nov 14')
    expect(email.text).toContain('not a charge')
    expect(email.text).toContain('https://hold.test/r/abc/pay')
  })

  it('is written in the renter’s language', () => {
    expect(holdReplacementEmail('a@b.example', 'fr', ask).subject).toBe('Veuillez approuver une nouvelle empreinte pour votre location chez Ribeira Bikes')
    expect(holdReplacementEmail('a@b.example', 'es', ask).subject).toBe('Aprueba una nueva retención para tu alquiler en Ribeira Bikes')
  })
})
