import { describe, expect, it } from 'vitest'
import { reminderEmail } from './reminder-email.ts'

const facts = { shopName: 'Ribeira Bikes', dueOn: '20 Oct, 18:00' as string | null }

describe('the operations agent\'s automatic reminders', () => {
  it('say what is due and by when, from the shop, and name no amount', () => {
    for (const kind of ['return_due', 'reply_due', 'invoice'] as const) {
      const email = reminderEmail('priya@example.com', 'en', kind, facts)
      expect(email.to).toBe('priya@example.com')
      expect(email.subject).toContain('Ribeira Bikes')
      if (kind !== 'invoice') expect(email.text).toContain('20 Oct, 18:00')
      expect(email.text).not.toMatch(/[€$£]|\d+[.,]\d{2}/)
    }
    expect(reminderEmail('a@b.example', 'en', 'return_due', facts).subject).toMatch(/return/i)
    expect(reminderEmail('a@b.example', 'en', 'reply_due', facts).subject).toMatch(/claim/i)
    expect(reminderEmail('a@b.example', 'en', 'invoice', facts).subject).toMatch(/invoice/i)
  })

  it('is written in the renter\'s language, English otherwise', () => {
    expect(reminderEmail('a@b.example', 'de', 'return_due', facts).subject).toContain('Rückgabe')
    expect(reminderEmail('a@b.example', 'fr', 'invoice', facts).subject).toContain('facture')
    expect(reminderEmail('a@b.example', 'es', 'reply_due', facts).subject).toContain('reclamación')
    expect(reminderEmail('a@b.example', 'pt', 'return_due', facts).subject).toBe(reminderEmail('a@b.example', 'en', 'return_due', facts).subject)
  })
})
