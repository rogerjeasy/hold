import { describe, expect, it } from 'vitest'
import { promiseMissedEmail, promiseMissedRenterEmail, renterWroteEmail } from './claim-promise-emails.ts'

const facts = { shopName: 'Ribeira Bikes', renter: 'Priya Natarajan', claimUrl: 'https://hold.test/shop/rentals/r-1/claim' }

describe('the email that tells the owners a promised decision was missed', () => {
  it('says whose claim, that only the owner decides it now, and links to the claim', () => {
    const email = promiseMissedEmail('ana@ribeira.example', 'en', { ...facts, waived: false })
    expect(email).toMatchObject({ to: 'ana@ribeira.example', subject: 'A promised decision was missed: Priya Natarajan' })
    expect(email.text).toContain('Only the owner')
    expect(email.text).toContain('https://hold.test/shop/rentals/r-1/claim')
  })

  it('says the claim was waived and the hold released when the owner rule did it', () => {
    const email = promiseMissedEmail('ana@ribeira.example', 'en', { ...facts, waived: true })
    expect(email.subject).toBe('Waived under your rule: Priya Natarajan')
    expect(email.text).toContain('released')
  })

  it('is written in the reader’s language', () => {
    expect(promiseMissedEmail('a@b.example', 'de', { ...facts, waived: false }).subject).toBe('Zugesagte Entscheidung verpasst: Priya Natarajan')
    expect(promiseMissedEmail('a@b.example', 'fr', { ...facts, waived: true }).subject).toBe('Renoncée selon votre règle : Priya Natarajan')
    expect(promiseMissedEmail('a@b.example', 'es', { ...facts, waived: false }).subject).toBe('Decisión prometida no cumplida: Priya Natarajan')
    expect(promiseMissedEmail('a@b.example', 'xx', { ...facts, waived: false }).subject).toBe('A promised decision was missed: Priya Natarajan')
  })
})

describe('the email that tells staff a renter wrote about a claim', () => {
  it('names the renter and links to the claim, and never quotes their words', () => {
    const email = renterWroteEmail('ana@ribeira.example', 'en', facts)
    expect(email.subject).toBe('Priya Natarajan wrote about their claim')
    expect(email.text).toContain('https://hold.test/shop/rentals/r-1/claim')
    expect(Object.keys(facts)).not.toContain('body')
  })

  it('is written in the reader’s language', () => {
    expect(renterWroteEmail('a@b.example', 'de', facts).subject).toBe('Priya Natarajan hat zur Forderung geschrieben')
    expect(renterWroteEmail('a@b.example', 'fr', facts).subject).toBe('Priya Natarajan a écrit au sujet de sa réclamation')
    expect(renterWroteEmail('a@b.example', 'es', facts).subject).toBe('Priya Natarajan ha escrito sobre su reclamación')
  })
})

describe('the email that tells the renter the shop missed its date', () => {
  it('says the shop did not decide in time, and what happens now', () => {
    const missed = promiseMissedRenterEmail('priya@example.com', 'en', { shopName: 'Ribeira Bikes', waived: false })
    expect(missed).toMatchObject({ to: 'priya@example.com', subject: 'Ribeira Bikes did not decide your claim in time' })
    expect(missed.text).toContain('owner')
    expect(missed.text).toContain('written reason')
    expect(promiseMissedRenterEmail('priya@example.com', 'en', { shopName: 'Ribeira Bikes', waived: true }).text).toContain('nothing is charged')
    expect(promiseMissedRenterEmail('a@b.example', 'fr', { shopName: 'Ribeira Bikes', waived: false }).subject).toBe('Ribeira Bikes n’a pas décidé de votre réclamation à temps')
  })
})
