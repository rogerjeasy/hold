import 'server-only'
import { findPerson, inShop, takeRateToken, unregisterStaffPush } from '@hold/db'
import type { RateLimit } from '@hold/db'
import type { Tokens } from '@hold/auth'
import { demoStartInput, refreshInput, signInStartInput, signInVerifyInput, signOutInput } from '@hold/mobile-api'
import type { z } from 'zod'
import { readAttempt } from '@/features/auth/attempt'
import { parseAuthInput } from '@/features/auth/auth-input'
import { parseCode } from '@/features/auth/code-input'
import { continueDemo, demoSessionSchema, startDemo } from '@/features/auth/demo-session'
import type { DemoSession } from '@/features/auth/demo-session'
import { demoDependencies, flowDependencies, requester } from '@/features/auth/flow-dependencies'
import { readLocale } from '@/features/auth/locale-input'
import { seal, unseal } from '@/features/auth/sealed'
import { hasSessionCookie } from '@/features/auth/session-cookies'
import { beginSignIn, answerCode } from '@/features/auth/sign-in-flow'
import { answer, failed, readJsonObject } from './mobile-json'
import type { MobileAnswer } from './mobile-json'
import { failedFields } from './action'
import { callerNetwork } from './network'
import { getServices } from './services'
import { bearerOf } from './staff-bearer'

// Signing in on the phone (architecture.md section 13.7): the web's own sign-in steps (sign-in-flow.ts, demo-session.ts)
// with the tokens in the answer's body instead of cookies. The attempt between the two steps and a judge's demo travel
// sealed with the cookie key, so the phone keeps them and can neither read nor change them. No token is ever logged:
// the steps below log only the identity service's kind of failure.

// On top of the sign-in steps' own limits, for every session route, so refreshing and signing out are limited too.
export const MOBILE_SESSION_LIMIT = { name: 'mobile_session_per_network', max: 60, windowSeconds: 15 * 60 } as const satisfies RateLimit

type Route = (request: Request, context: { readonly params: Promise<unknown> }) => Promise<Response>

const ROUTES = new WeakSet<object>()

export function isMobileSessionRoute(value: unknown): boolean {
  return typeof value === 'function' && ROUTES.has(value)
}

async function withinLimit(): Promise<boolean> {
  return takeRateToken((await getServices()).database, MOBILE_SESSION_LIMIT, (await callerNetwork()) ?? 'local')
}

// A POST whose JSON body is checked against a strict schema before anything else.
function sessionRoute<Input>(input: z.ZodType<Input>, act: (input: Input, request: Request) => Promise<MobileAnswer>): Route {
  const handler: Route = async (request) => {
    if (!(await withinLimit())) return answer(failed('rate_limited'))
    const body = await readJsonObject(request)
    if (body === undefined) return answer(failed('invalid', { fields: [] }))
    const parsed = input.safeParse(body)
    if (!parsed.success) return answer(failed('invalid', { fields: failedFields(parsed.error) }))
    return answer(await act(parsed.data, request))
  }
  ROUTES.add(handler)
  return handler
}

// The phone's tokens. A sign-in always brings a refresh token; one without counts as the service failing.
function tokensOf(tokens: Tokens): { readonly accessToken: string; readonly refreshToken: string; readonly expiresInSeconds: number } | undefined {
  return tokens.refreshToken === undefined ? undefined : { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresInSeconds: tokens.expiresInSeconds }
}

const busyOr = (notice: string): MobileAnswer => (notice === 'busy' ? failed('rate_limited') : failed('refused', { reason: notice }))

// Only an address with an account can sign in here: owners sign up and staff accept invitations on the web. Every
// address gets the same answer, as on the web's sign-in page.
export const startSignIn = sessionRoute(signInStartInput, async (input) => {
  const email = parseAuthInput(['email'], input)
  if (!email.ok) return failed('invalid', { fields: ['email'] })
  const begun = await beginSignIn(await flowDependencies(), { email: email.value.email, language: readLocale(input.locale) }, await requester())
  if (!begun.ok) return busyOr(begun.notice)
  return { ok: true, value: { attempt: seal(begun.attempt, (await getServices()).cookieKey), expiresAt: new Date(begun.attempt.expiresAt).toISOString() } }
})

export const verifySignIn = sessionRoute(signInVerifyInput, async (input) => {
  const code = parseCode(input.code)
  if (!code.ok) return failed('invalid', { fields: ['code'] })
  const attempt = readAttempt(unseal(input.attempt, (await getServices()).cookieKey), new Date())
  if (attempt?.page !== 'signIn' || attempt.step !== 'answer_sign_in') return failed('refused', { reason: 'attempt_over' })
  const outcome = await answerCode(await flowDependencies(), attempt, code.code, await requester())
  if (outcome.kind === 'failed') return busyOr(outcome.failure)
  const tokens = outcome.kind === 'signed_in' ? tokensOf(outcome.tokens) : undefined
  return tokens === undefined ? failed('refused', { reason: 'unavailable' }) : { ok: true, value: tokens }
})

export const refreshSession = sessionRoute(refreshInput, async (input) => {
  const refreshed = await (await getServices()).identity.refresh(input.refreshToken)
  if (!refreshed.ok) return failed('signed_out')
  return { ok: true, value: { accessToken: refreshed.value.accessToken, expiresInSeconds: refreshed.value.expiresInSeconds } }
})

// Revokes the refresh token at the identity service, so a copied one stops working.
export const endSession = sessionRoute(signOutInput, async (input, request) => {
  if (input.pushToken !== undefined) await endPushes(request, input.pushToken)
  const revoked = await (await getServices()).identity.signOut(input.refreshToken)
  if (revoked.ok) return { ok: true, value: {} }
  console.warn(JSON.stringify({ event: 'identity_failure', step: 'sign_out', kind: revoked.error.kind }))
  return failed('refused', { reason: 'unavailable' })
})

// The phone's push registrations end with its session, in every shop the bearer's person works in (architecture.md
// section 13.9). Only a bearer that verifies names the person; without one, nothing is changed.
async function endPushes(request: Request, pushToken: string): Promise<void> {
  const bearer = bearerOf(request.headers)
  if (bearer === undefined) return
  const { identity, database } = await getServices()
  const verified = await identity.verifyAccessToken(bearer.accessToken)
  if (!verified.ok) return
  const person = await findPerson(database, verified.value.subject)
  if (person === undefined) return
  for (const shop of person.shops) {
    await inShop(database, { role: 'hold_app', shopId: shop.shopId, userId: person.userId }, (transaction) => unregisterStaffPush(transaction, person.userId, pushToken, new Date()))
  }
}

// A judge's one tap (architecture.md section 20.3): a fresh demo, or, with the demo this phone started, either of its
// two people again. The demo goes back sealed, so its passwords never reach the phone readable.
export const startDemoSession = sessionRoute(demoStartInput, async (input) => {
  const demo = await demoDependencies()
  const { cookieKey } = await getServices()
  let session: DemoSession
  let tokens: Tokens
  if (input.demo === undefined) {
    const started = await startDemo(demo, input.account, await requester())
    if (!started.ok) return busyOr(started.notice)
    session = started.session
    tokens = started.tokens
  } else {
    const kept = demoSessionSchema.safeParse(unseal(input.demo, cookieKey))
    if (!kept.success) return failed('invalid', { fields: ['demo'] })
    const signedIn = await continueDemo(demo, kept.data, input.account, await requester())
    if (!signedIn.ok) return busyOr(signedIn.notice)
    session = kept.data
    tokens = signedIn.tokens
  }
  const phone = tokensOf(tokens)
  return phone === undefined ? failed('refused', { reason: 'unavailable' }) : { ok: true, value: { ...phone, demo: seal(session, cookieKey), shopId: session.shopId } }
})

// Who the bearer is and the shops they work in, for the phone to choose one.
export const whoAmI: Route = async (request) => {
  if (!(await withinLimit())) return answer(failed('rate_limited'))
  const bearer = bearerOf(request.headers)
  if (bearer === undefined || (await hasSessionCookie())) return answer(failed('signed_out'))
  const { identity, database } = await getServices()
  const verified = await identity.verifyAccessToken(bearer.accessToken)
  if (!verified.ok) return answer(failed('signed_out'))
  const person = await findPerson(database, verified.value.subject)
  if (person === undefined) return answer(failed('no_shop'))
  return answer({ ok: true, value: { name: person.name, email: person.email, shops: person.shops.map(({ shopId, name, role }) => ({ shopId, name, role })) } })
}
ROUTES.add(whoAmI)
