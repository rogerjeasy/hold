import type { WebConfig } from '@hold/config'

// The cookies that carry a session, and how they are set.
const BASE_NAMES = {
  access: 'hold_access',
  refresh: 'hold_refresh',
  attempt: 'hold_attempt',
  // How this session was proven: an emailed code, or a passkey. Sealed, and bound to the session's refresh token.
  factor: 'hold_factor',
  // Which of the person's shops they are working in.
  shop: 'hold_shop',
  // Readable by the page, so the header can say "Your shop" on pages that are otherwise the same for everyone.
  // It grants nothing: every request checks the access token on the server.
  signedIn: 'hold_signed_in',
  // The demo this browser started: its shop and the passwords of its two accounts, sealed. Kept apart from the session
  // cookies, so signing out keeps it and the judge can come back as Tomás or Jonas (architecture.md section 20.3).
  demo: 'hold_demo',
} as const

export type CookieName = keyof typeof BASE_NAMES

// The names that end a session when it is cleared: all but the demo's.
export const SESSION_COOKIES: readonly CookieName[] = ['access', 'refresh', 'attempt', 'factor', 'shop', 'signedIn']

// The prefix the readable flag carries where the cookies are Secure, for the page that looks for it.
export const HOST_PREFIX = '__Host-'
export const SIGNED_IN_COOKIE = BASE_NAMES.signedIn

// As long as the identity service keeps a refresh token (infra/lib/identity-stack.ts).
export const REFRESH_SECONDS = 30 * 24 * 60 * 60

type Environment = Pick<WebConfig, 'environment'>

const isSecure = (config: Environment) => config.environment !== 'development'

// A browser keeps a __Host- cookie only if it is Secure, has Path=/ and names no Domain, so no other host, not even a
// neighbour on App Runner's shared domain, and no plain-HTTP page can set one or shadow it. A developer's own machine
// serves plain HTTP, where a browser refuses the prefix, so there the names are plain.
export function cookieNames(config: Environment): Readonly<Record<CookieName, string>> {
  const prefix = isSecure(config) ? HOST_PREFIX : ''
  return Object.fromEntries(Object.entries(BASE_NAMES).map(([key, name]) => [key, `${prefix}${name}`])) as Record<CookieName, string>
}

export function cookieOptions(config: Environment) {
  // HTTP-only, so no script on the page can read them. Plain HTTP only on a developer's own machine.
  return { httpOnly: true, sameSite: 'lax', secure: isSecure(config), path: '/' } as const
}
