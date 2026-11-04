import 'server-only'
import { createHash } from 'node:crypto'
import type { Tokens } from '@hold/auth'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { getServices } from '@/server/services'
import { readAttempt } from './attempt'
import type { Attempt } from './attempt'
import { cookieNames, cookieOptions, REFRESH_SECONDS, SESSION_COOKIES } from './cookie-settings'
import { demoSessionSchema } from './demo-session'
import type { DemoSession } from './demo-session'
import { seal, unseal } from './sealed'

// `demo` is a demo account a judge signed in to with one tap: weaker than a passkey, like an emailed code.
export type SignInFactor = 'email_code' | 'passkey' | 'demo'

// Bound to the person and to the session, so it cannot be carried to another account's tokens.
const factorSchema = z.object({ factor: z.enum(['email_code', 'passkey', 'demo']), subject: z.string(), session: z.string() }).strict()

// Names the session the factor belongs to without keeping the refresh token itself in a second place.
function sessionFingerprint(refreshToken: string): string {
  return createHash('sha256').update(refreshToken).digest('base64url').slice(0, 22)
}

async function baseOptions() {
  return cookieOptions((await getServices()).config)
}

async function names() {
  return cookieNames((await getServices()).config)
}

// A cookie is removed with the attributes it was set with: a browser ignores the removal of a __Host- cookie that
// lacks Secure and Path=/, and the session would stay.
async function removal(name: string) {
  return { name, ...(await baseOptions()) }
}

export async function writeSession(tokens: Tokens, factor: SignInFactor): Promise<void> {
  const store = await cookies()
  const { cookieKey, identity } = await getServices()
  const verified = await identity.verifyAccessToken(tokens.accessToken)
  const options = await baseOptions()
  const name = await names()
  // The browser drops the access token when it lapses, and the refresh token then gets a new one.
  store.set(name.access, tokens.accessToken, { ...options, maxAge: tokens.expiresInSeconds })
  if (tokens.refreshToken !== undefined) {
    store.set(name.refresh, tokens.refreshToken, { ...options, maxAge: REFRESH_SECONDS })
  }
  // A session whose person cannot be named keeps no record of a passkey, and so counts as an emailed code.
  if (tokens.refreshToken !== undefined && verified.ok) {
    const record = { factor, subject: verified.value.subject, session: sessionFingerprint(tokens.refreshToken) }
    store.set(name.factor, seal(record, cookieKey), { ...options, maxAge: REFRESH_SECONDS })
  } else {
    store.delete(await removal(name.factor))
  }
  store.set(name.signedIn, '1', { ...options, httpOnly: false, maxAge: REFRESH_SECONDS })
  store.delete(await removal(name.attempt))
}

export async function clearSession(): Promise<void> {
  const store = await cookies()
  const name = await names()
  for (const cookie of SESSION_COOKIES) store.delete(await removal(name[cookie]))
}

export async function readRefreshToken(): Promise<string | undefined> {
  return (await cookies()).get((await names()).refresh)?.value
}

export async function readAccessToken(): Promise<string | undefined> {
  return (await cookies()).get((await names()).access)?.value
}

// Whether the request carries a browser's session at all. The phone's bearer requests must not.
export async function hasSessionCookie(): Promise<boolean> {
  const store = await cookies()
  const name = await names()
  return store.get(name.access) !== undefined || store.get(name.refresh) !== undefined
}

// How the current session was proven, for the person its access token names. An emailed code unless a passkey proved
// this very session for this very person: a record from another account's session counts for nothing.
export async function sessionFactor(subject: string): Promise<SignInFactor> {
  const store = await cookies()
  const name = await names()
  const sealed = store.get(name.factor)?.value
  const refreshToken = store.get(name.refresh)?.value
  if (sealed === undefined || refreshToken === undefined) return 'email_code'
  const parsed = factorSchema.safeParse(unseal(sealed, (await getServices()).cookieKey))
  const matches = parsed.success && parsed.data.subject === subject && parsed.data.session === sessionFingerprint(refreshToken)
  return matches ? parsed.data.factor : 'email_code'
}

export async function writeDemoSession(session: DemoSession): Promise<void> {
  ;(await cookies()).set((await names()).demo, seal(session, (await getServices()).cookieKey), { ...(await baseOptions()), maxAge: REFRESH_SECONDS })
}

// The demo this browser started, if it has one and it was not altered.
export async function readDemoSession(): Promise<DemoSession | undefined> {
  const sealed = (await cookies()).get((await names()).demo)?.value
  if (sealed === undefined) return undefined
  const parsed = demoSessionSchema.safeParse(unseal(sealed, (await getServices()).cookieKey))
  return parsed.success ? parsed.data : undefined
}

export async function chosenShopId(): Promise<string | undefined> {
  return (await cookies()).get((await names()).shop)?.value
}

export async function chooseShop(shopId: string): Promise<void> {
  ;(await cookies()).set((await names()).shop, shopId, { ...(await baseOptions()), maxAge: REFRESH_SECONDS })
}

export async function writeAttempt(attempt: Attempt): Promise<void> {
  const { cookieKey } = await getServices()
  const store = await cookies()
  const seconds = Math.max(0, Math.round((attempt.expiresAt - Date.now()) / 1000))
  store.set((await names()).attempt, seal(attempt, cookieKey), { ...(await baseOptions()), maxAge: seconds })
}

// The attempt in progress, if one was started here, has not lapsed and was not altered.
export async function currentAttempt(): Promise<Attempt | undefined> {
  const sealed = (await cookies()).get((await names()).attempt)?.value
  if (sealed === undefined) return undefined
  return readAttempt(unseal(sealed, (await getServices()).cookieKey), new Date())
}

export async function clearAttempt(): Promise<void> {
  ;(await cookies()).delete(await removal((await names()).attempt))
}
