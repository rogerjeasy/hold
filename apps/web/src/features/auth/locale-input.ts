import { hasLocale } from 'next-intl'
import { routing, type Locale } from '@/i18n/routing'

// The page's language, sent with each form. A server function has no route of its own to read it from. Anything
// that is not one of Hold's languages becomes the default.
export function readLocale(input: unknown): Locale {
  return typeof input === 'string' && hasLocale(routing.locales, input) ? input : routing.defaultLocale
}
