import type { Email } from './mailer.ts'

// A message the shop approved on the morning queue (extensions.md section 6.3), sent as written: the words passed the
// number guard when they were drafted, and a person read them before approving.

type Language = 'en' | 'de' | 'es' | 'fr'
const isLanguage = (value: string): value is Language => ['en', 'de', 'es', 'fr'].includes(value)

const SUBJECTS: Readonly<Record<Language, (shop: string) => string>> = {
  en: (shop) => `A message from ${shop} about your rental`,
  de: (shop) => `Eine Nachricht von ${shop} zu Ihrer Miete`,
  es: (shop) => `Un mensaje de ${shop} sobre tu alquiler`,
  fr: (shop) => `Un message de ${shop} au sujet de votre location`,
}

export function shopMessageEmail(to: string, language: string, facts: { readonly shopName: string; readonly text: string }): Email {
  return { to, subject: SUBJECTS[isLanguage(language) ? language : 'en'](facts.shopName), text: `${facts.text}\n\n${facts.shopName}` }
}

// The same message as a text, for a renter who chose texts (architecture.md section 12.3).
export function shopMessageText(facts: { readonly shopName: string; readonly text: string }): string {
  return `${facts.shopName}: ${facts.text}`
}
