import type { WebConfig } from '@hold/config'

// The cookies that carry a session, and how they are set.
export const COOKIE_NAMES = {
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
} as const

// The demo this browser started: its shop and the passwords of its two accounts, sealed. Kept apart from the session
// cookies, so signing out keeps it and the judge can come back as Tomás or Jonas (architecture.md section 20.3).
export const DEMO_COOKIE = 'hold_demo'

// As long as the identity service keeps a refresh token (infra/lib/identity-stack.ts).
export const REFRESH_SECONDS = 30 * 24 * 60 * 60

export function cookieOptions(config: WebConfig) {
  // HTTP-only, so no script on the page can read them. Plain HTTP only on a developer's own machine.
  return { httpOnly: true, sameSite: 'lax', secure: config.environment !== 'development', path: '/' } as const
}
