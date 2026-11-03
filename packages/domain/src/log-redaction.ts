// What may reach a log (AGENTS.md section 7): no tokens, credentials or unmasked personal details. An error's text is
// still the fastest way to a fault, so it is logged with these taken out rather than not at all.

const REDACTED = '[redacted]'

// A failed query names its values after "params:", and they can be a renter's details; they run to the stack's first
// frame or the end.
const QUERY_VALUES = /params:[\s\S]*?(?=\n\s+at |$)/g
const SIGNED_IN_TOKEN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g
const AUTHORIZATION = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi
// A named value in a URL, a form or JSON: PayPal's token, ba_token and PayerID in a return URL among them.
const NAMED_SECRET = /\b([A-Za-z_]*(?:token|secret|password|payerid|payer_id|api_key|apikey))("?\s*[:=]\s*"?)[^\s"&,;]+/gi
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const PHONE = /\+\d{8,15}\b/g
const LONG_HEX = /\b[0-9A-Fa-f]{32,}\b/g
// Base64 and base64url of 40 or more characters. A path or a long name has the same characters, so a run counts only
// when it mixes digits with upper and lower case, as random bytes do.
const LONG_BASE64 = /[A-Za-z0-9+/_-]{40,}={0,2}/g
const looksRandom = (run: string) => /\d/.test(run) && /[A-Z]/.test(run) && /[a-z]/.test(run)

export function redactForLog(text: string): string {
  return text
    .replace(QUERY_VALUES, `params: ${REDACTED}`)
    .replace(SIGNED_IN_TOKEN, REDACTED)
    .replace(AUTHORIZATION, `$1 ${REDACTED}`)
    .replace(NAMED_SECRET, `$1$2${REDACTED}`)
    .replace(EMAIL, REDACTED)
    .replace(PHONE, REDACTED)
    .replace(LONG_HEX, REDACTED)
    .replace(LONG_BASE64, (run) => (looksRandom(run) ? REDACTED : run))
}

// A cause rarely nests deeper; this keeps a cause that refers back to its error from running on.
const MAX_CAUSES = 3

// An error as one redacted text: its name and message, its stack frames, then each cause in the same way.
export function errorForLog(error: unknown): string {
  if (!(error instanceof Error)) return typeof error === 'string' ? redactForLog(error) : 'unknown error'
  const parts: string[] = []
  const seen = new Set<unknown>()
  let current: unknown = error
  while (current instanceof Error && !seen.has(current) && seen.size <= MAX_CAUSES) {
    seen.add(current)
    const frames = (current.stack ?? '').split('\n').filter((line) => /^\s+at /.test(line))
    // Each on its own, so the values of a failed query end with its own frames, never with its cause.
    parts.push(redactForLog([`${seen.size === 1 ? '' : 'Caused by '}${current.name}: ${current.message}`, ...frames].join('\n')))
    current = current.cause
  }
  return parts.join('\n')
}
