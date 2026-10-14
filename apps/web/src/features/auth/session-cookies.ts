import 'server-only'
import { createHash } from 'node:crypto'
import type { Tokens } from '@hold/auth'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { getServices } from '@/server/services'
import { readAttempt } from './attempt'
import type { Attempt } from './attempt'
import { COOKIE_NAMES, cookieOptions, REFRESH_SECONDS } from './cookie-settings'
import { seal, unseal } from './sealed'

export type SignInFactor = 'email_code' | 'passkey'

const factorSchema = z.object({ factor: z.enum(['email_code', 'passkey']), session: z.string() }).strict()

// Names the session the factor belongs to without keeping the refresh token itself in a second place.
function sessionFingerprint(refreshToken: string): string {
  return createHash('sha256').update(refreshToken).digest('base64url').slice(0, 22)
}

async function baseOptions() {
  return cookieOptions((await getServices()).config)
}

export async function writeSession(tokens: Tokens, factor: SignInFactor): Promise<void> {
  const store = await cookies()
  const { cookieKey } = await getServices()
  const options = await baseOptions()
  // The browser drops the access token when it lapses, and the refresh token then gets a new one.
  store.set(COOKIE_NAMES.access, tokens.accessToken, { ...options, maxAge: tokens.expiresInSeconds })
  if (tokens.refreshToken !== undefined) {
    store.set(COOKIE_NAMES.refresh, tokens.refreshToken, { ...options, maxAge: REFRESH_SECONDS })
    store.set(COOKIE_NAMES.factor, seal({ factor, session: sessionFingerprint(tokens.refreshToken) }, cookieKey), { ...options, maxAge: REFRESH_SECONDS })
  }
  store.set(COOKIE_NAMES.signedIn, '1', { ...options, httpOnly: false, maxAge: REFRESH_SECONDS })
  store.delete(COOKIE_NAMES.attempt)
}

export async function clearSession(): Promise<void> {
  const store = await cookies()
  for (const name of Object.values(COOKIE_NAMES)) store.delete(name)
}

export async function readRefreshToken(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE_NAMES.refresh)?.value
}

export async function readAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE_NAMES.access)?.value
}

// How the current session was proven. An emailed code unless a passkey proved this very session.
export async function sessionFactor(): Promise<SignInFactor> {
  const store = await cookies()
  const sealed = store.get(COOKIE_NAMES.factor)?.value
  const refreshToken = store.get(COOKIE_NAMES.refresh)?.value
  if (sealed === undefined || refreshToken === undefined) return 'email_code'
  const parsed = factorSchema.safeParse(unseal(sealed, (await getServices()).cookieKey))
  return parsed.success && parsed.data.session === sessionFingerprint(refreshToken) ? parsed.data.factor : 'email_code'
}

export async function chosenShopId(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE_NAMES.shop)?.value
}

export async function chooseShop(shopId: string): Promise<void> {
  ;(await cookies()).set(COOKIE_NAMES.shop, shopId, { ...(await baseOptions()), maxAge: REFRESH_SECONDS })
}

export async function writeAttempt(attempt: Attempt): Promise<void> {
  const { cookieKey } = await getServices()
  const store = await cookies()
  const seconds = Math.max(0, Math.round((attempt.expiresAt - Date.now()) / 1000))
  store.set(COOKIE_NAMES.attempt, seal(attempt, cookieKey), { ...(await baseOptions()), maxAge: seconds })
}

// The attempt in progress, if one was started here, has not lapsed and was not altered.
export async function currentAttempt(): Promise<Attempt | undefined> {
  const sealed = (await cookies()).get(COOKIE_NAMES.attempt)?.value
  if (sealed === undefined) return undefined
  return readAttempt(unseal(sealed, (await getServices()).cookieKey), new Date())
}

export async function clearAttempt(): Promise<void> {
  ;(await cookies()).delete(COOKIE_NAMES.attempt)
}
