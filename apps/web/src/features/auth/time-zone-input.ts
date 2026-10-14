// The browser's time zone, sent with the sign-up form, so the shop's days start at its own midnight. Anything that
// is not a time zone the server knows becomes UTC.
const FALLBACK = 'UTC'

export function readTimeZone(input: unknown): string {
  if (typeof input !== 'string' || input === '' || input.length > 64) return FALLBACK
  try {
    return new Intl.DateTimeFormat('en', { timeZone: input }).resolvedOptions().timeZone
  } catch {
    return FALLBACK
  }
}
