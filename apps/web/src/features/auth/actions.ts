'use server'

import { DEMO_ACCOUNT_KEYS } from '@hold/auth'
import { findPerson } from '@hold/db'
import { z } from 'zod'
import { redirect } from '@/i18n/navigation'
import { linkRoutes, routes, shopRoutes } from '@/lib/routes'
import { getServices } from '@/server/services'
import type { Attempt, AttemptPage } from './attempt'
import type { AuthFormState, CodeFormState, DemoFormState, PasskeyFormState } from './auth-form-state'
import { parseAuthInput, readText, signInFields, signUpFields, type AuthField } from './auth-input'
import { parseCode } from './code-input'
import { continueDemo, startDemo } from './demo-session'
import type { DemoSession } from './demo-session'
import { demoDependencies, flowDependencies as dependencies, requester } from './flow-dependencies'
import { readLocale } from './locale-input'
import { chooseShop, clearAttempt, clearSession, currentAttempt, readAccessToken, readDemoSession, readRefreshToken, sessionFactor, writeAttempt, writeDemoSession, writeSession } from './session-cookies'
import { answerCode, answerPasskey, beginInvitation, beginPasskey, beginSignIn, beginSignUp, resendCode } from './sign-in-flow'
import type { Begun, ProofOutcome } from './sign-in-flow'
import { readTimeZone } from './time-zone-input'

// The server functions behind the sign-in, sign-up and invitation pages. Each checks its input with the same
// function the browser used, then hands the work to sign-in-flow.ts and keeps the cookies.

function pageRoute(attempt: Pick<Attempt, 'page' | 'invitation'>): string {
  if (attempt.page === 'invite' && attempt.invitation !== undefined) return `${linkRoutes.invite}/${attempt.invitation.token}`
  return attempt.page === 'signUp' ? routes.signUp : routes.signIn
}

function goTo(href: string, locale: string): never {
  return redirect({ href, locale: readLocale(locale) })
}

function problemsOf(fields: readonly AuthField[], data: FormData) {
  const input = Object.fromEntries(fields.map((field) => [field, data.get(field)]))
  const parsed = parseAuthInput(fields, input)
  const values = Object.fromEntries(fields.map((field) => [field, readText(input[field])]))
  return { parsed, values }
}

async function continueWith(begun: Begun, values: AuthFormState['values']): Promise<AuthFormState> {
  if (!begun.ok) return { values, problems: {}, notice: begun.notice }
  await writeAttempt(begun.attempt)
  return goTo(pageRoute(begun.attempt), begun.attempt.language)
}

export async function requestSignIn(_previous: AuthFormState, data: FormData): Promise<AuthFormState> {
  const { parsed, values } = problemsOf(signInFields, data)
  if (!parsed.ok) return { values, problems: parsed.problems }
  const begun = await beginSignIn(await dependencies(), { email: parsed.value.email, language: readLocale(data.get('locale')) }, await requester())
  return continueWith(begun, values)
}

export async function requestSignUp(_previous: AuthFormState, data: FormData): Promise<AuthFormState> {
  const { parsed, values } = problemsOf(signUpFields, data)
  if (!parsed.ok) return { values, problems: parsed.problems }
  const begun = await beginSignUp(
    await dependencies(),
    { ...parsed.value, timeZone: readTimeZone(data.get('timeZone')), language: readLocale(data.get('locale')) },
    await requester(),
  )
  return continueWith(begun, values)
}

export async function requestInvitationCode(_previous: AuthFormState, data: FormData): Promise<AuthFormState> {
  const { parsed, values } = problemsOf(['name'], data)
  if (!parsed.ok) return { values, problems: parsed.problems }
  const token = readText(data.get('token'))
  const begun = await beginInvitation(await dependencies(), { token, name: parsed.value.name, language: readLocale(data.get('locale')) }, await requester())
  return continueWith(begun, values)
}

const demoAccountKey = z.enum(DEMO_ACCOUNT_KEYS)

const demoChoice = z.enum(['start', 'continue'])

// One tap starts a demo of the judge's own, or signs the browser that started one in again as either of its people.
// The session counts as weaker than a passkey, so money steps still ask for one.
export async function signInWithDemoAccount(_previous: DemoFormState, data: FormData): Promise<DemoFormState> {
  const key = demoAccountKey.safeParse(data.get('account'))
  const choice = demoChoice.safeParse(data.get('demo'))
  if (!key.success || !choice.success) return { notice: 'unavailable' }
  const demo = await demoDependencies()
  // A demo this browser no longer holds cannot be continued, so a fresh one starts instead.
  const current = choice.data === 'continue' ? await readDemoSession() : undefined
  let session: DemoSession
  if (current === undefined) {
    const started = await startDemo(demo, key.data, await requester())
    if (!started.ok) return { notice: started.notice }
    await writeDemoSession(started.session)
    await writeSession(started.tokens, 'demo')
    session = started.session
  } else {
    const signedIn = await continueDemo(demo, current, key.data, await requester())
    if (!signedIn.ok) return { notice: signedIn.notice }
    await writeSession(signedIn.tokens, 'demo')
    session = current
  }
  await chooseShop(session.shopId)
  return goTo(shopRoutes.home, readLocale(data.get('locale')))
}

async function finish(outcome: ProofOutcome, attempt: Attempt, factor: 'email_code' | 'passkey'): Promise<CodeFormState> {
  if (outcome.kind === 'failed') return { problem: outcome.failure }
  if (outcome.kind === 'next_code') {
    await writeAttempt(outcome.attempt)
    return { resent: true }
  }
  await writeSession(outcome.tokens, factor)
  return goTo(attempt.returnTo ?? shopRoutes.home, attempt.language)
}

export async function submitCode(_previous: CodeFormState, data: FormData): Promise<CodeFormState> {
  const parsed = parseCode(data.get('code'))
  if (!parsed.ok) return { problem: parsed.problem }
  const attempt = await currentAttempt()
  if (attempt === undefined) return { problem: 'attempt_over' }
  return finish(await answerCode(await dependencies(), attempt, parsed.code, await requester()), attempt, 'email_code')
}

export async function sendNewCode(): Promise<CodeFormState> {
  const attempt = await currentAttempt()
  if (attempt === undefined) return { problem: 'attempt_over' }
  const begun = await resendCode(await dependencies(), attempt, await requester())
  if (!begun.ok) return { problem: begun.notice }
  await writeAttempt(begun.attempt)
  return { resent: true }
}

// Back to the form, to use a different address.
export async function startOver(data: FormData): Promise<void> {
  const attempt = await currentAttempt()
  await clearAttempt()
  const page = data.get('page')
  const fallback: AttemptPage = page === 'signUp' ? 'signUp' : 'signIn'
  goTo(attempt === undefined ? pageRoute({ page: fallback }) : pageRoute(attempt), readLocale(data.get('locale')))
}

// The address of the person signed in on this browser, as the database knows it. Nothing when nobody is.
async function signedInEmail(): Promise<string | undefined> {
  const accessToken = await readAccessToken()
  if (accessToken === undefined) return undefined
  const { identity, database } = await getServices()
  const verified = await identity.verifyAccessToken(accessToken)
  return verified.ok ? (await findPerson(database, verified.value.subject))?.email : undefined
}

// The first half of a passkey sign-in. The browser asks the person's device with the options this returns.
// Confirming, for a person already signed in, uses their own address, whatever the page sent. Anyone else is signing
// in, and gets the same answer for every address.
export async function startPasskeySignIn(input: { email: string; locale: string; returnTo?: string }): Promise<PasskeyFormState> {
  const ownEmail = input.returnTo?.startsWith(shopRoutes.home) === true ? await signedInEmail() : undefined
  const parsed = parseAuthInput(['email'], { email: ownEmail ?? input.email })
  if (!parsed.ok) return { problem: 'email' }
  const begun = await beginPasskey(
    await dependencies(),
    ownEmail === undefined
      ? { email: parsed.value.email, language: readLocale(input.locale), page: 'signIn' }
      : { email: parsed.value.email, language: readLocale(input.locale), page: 'confirm', returnTo: input.returnTo },
    await requester(),
  )
  if (!begun.ok) return { problem: begun.notice }
  await writeAttempt(begun.attempt)
  return { requestOptions: begun.requestOptions }
}

// The second half: the device's answer. Signs the person in with a session a passkey proved.
export async function finishPasskeySignIn(response: string): Promise<PasskeyFormState> {
  const attempt = await currentAttempt()
  if (attempt === undefined || response.length > 20_000) return { problem: 'attempt_over' }
  const finished = await finish(await answerPasskey(await dependencies(), attempt, response, await requester()), attempt, 'passkey')
  return { problem: finished.problem }
}

// A person's first passkey can be added from a session an emailed code proved: there is nothing stronger yet. Once
// they have one, adding another needs a session that passkey proved. Otherwise someone who reached their inbox could
// add a passkey of their own and pass every passkey check after it.
async function mayAddPasskey(accessToken: string): Promise<boolean> {
  const { identity } = await getServices()
  const [verified, existing] = await Promise.all([identity.verifyAccessToken(accessToken), identity.listPasskeys(accessToken)])
  if (!verified.ok || !existing.ok) return false
  const factor = await sessionFactor(verified.value.subject)
  return existing.value.length === 0 || factor === 'passkey'
}

// Registering a passkey needs a signed-in session. The options come from the identity service and go to the device.
export async function startPasskeyRegistration(): Promise<PasskeyFormState> {
  const accessToken = await readAccessToken()
  if (accessToken === undefined) return { problem: 'attempt_over' }
  if (!(await mayAddPasskey(accessToken))) return { problem: 'confirm_first' }
  const started = await (await getServices()).identity.startPasskeyRegistration(accessToken)
  return started.ok ? { creationOptions: started.value.creationOptions } : { problem: 'unavailable' }
}

export async function finishPasskeyRegistration(response: string): Promise<PasskeyFormState> {
  const accessToken = await readAccessToken()
  if (accessToken === undefined || response.length > 20_000) return { problem: 'attempt_over' }
  // Checked again here: the two halves are separate requests.
  if (!(await mayAddPasskey(accessToken))) return { problem: 'confirm_first' }
  const finished = await (await getServices()).identity.finishPasskeyRegistration(accessToken, response)
  return finished.ok ? { registered: true } : { problem: 'unavailable' }
}

export async function signOut(data: FormData): Promise<void> {
  const refreshToken = await readRefreshToken()
  if (refreshToken !== undefined) {
    const { identity } = await getServices()
    // Ends the session at the identity service too, so a copied refresh token stops working.
    const revoked = await identity.signOut(refreshToken)
    if (!revoked.ok) console.warn(JSON.stringify({ event: 'identity_failure', step: 'sign_out', kind: revoked.error.kind }))
  }
  await clearSession()
  goTo(routes.home, readLocale(data.get('locale')))
}
