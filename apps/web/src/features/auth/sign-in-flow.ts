import 'server-only'
import { randomBytes } from 'node:crypto'
import type { Identity, IdentityFailure, Tokens } from '@hold/auth'
import { acceptInvitation, findInvitation, registerOwner } from '@hold/db'
import type { Database, RateLimit } from '@hold/db'
import { errorForLog } from '@hold/domain'
import { attemptExpiry } from './attempt'
import type { Attempt } from './attempt'

// What happens between the forms and the identity service and database. The server functions in actions.ts read
// and write cookies around these. Every address that could receive a code gets the same answer, whether it has an
// account or not, so the forms cannot be used to find out who uses Hold.

export type FlowDependencies = {
  readonly identity: Identity
  readonly database: Database
  readonly now: () => Date
  // Counts one request against a limit for one subject, and says whether it is still within it.
  readonly allow: (limit: RateLimit, subject: string) => Promise<boolean>
}

// Hold's own limits, on top of Cognito's. A code email costs the shop and can be used to pester someone, so each
// address gets few. A network gets more, since a shop's staff may share one.
export const LIMITS = {
  codeEmailsPerAddress: { name: 'code_emails_per_address', max: 5, windowSeconds: 15 * 60 },
  requestsPerNetwork: { name: 'auth_requests_per_network', max: 40, windowSeconds: 15 * 60 },
} as const satisfies Record<string, RateLimit>

// A notice shown above the form, when the identity service could not act.
export type FlowNotice = 'busy' | 'unavailable' | 'no_passkey' | 'invitation_closed'
export type Begun = { readonly ok: true; readonly attempt: Attempt } | { readonly ok: false; readonly notice: FlowNotice }
export type PasskeyBegun = { readonly ok: true; readonly attempt: Attempt; readonly requestOptions: string } | { readonly ok: false; readonly notice: FlowNotice }

export type CodeFailure = 'wrong' | 'expired' | 'attempt_over' | 'second_factor' | FlowNotice

export type ProofOutcome =
  | { readonly kind: 'signed_in'; readonly tokens: Tokens }
  // The address is confirmed, and a sign-in code is on its way. Only when the identity service gave no way to sign
  // in straight after confirming.
  | { readonly kind: 'next_code'; readonly attempt: Attempt }
  | { readonly kind: 'failed'; readonly failure: CodeFailure }

// Kept for the code step's callers.
export type CodeOutcome = ProofOutcome

export type NewShopInput = { readonly name: string; readonly shopName: string; readonly email: string; readonly timeZone: string; readonly language: string }

// Who is asking, for the rate limit. The network address is known only behind the load balancer, which App Runner
// always puts in front of the app. A request with none came from a developer's own machine, and is limited by
// address alone.
export type Requester = { readonly network: string | undefined }

function notice(failure: IdentityFailure): FlowNotice {
  if (failure.kind === 'too_many_requests') return 'busy'
  if (failure.kind === 'no_passkey') return 'no_passkey'
  return 'unavailable'
}

const CODE_FAILURES: Partial<Record<IdentityFailure['kind'], CodeFailure>> = {
  wrong_code: 'wrong',
  code_expired: 'expired',
  attempt_expired: 'attempt_over',
  second_factor_required: 'second_factor',
  too_many_requests: 'busy',
  // A passkey that does not match the address reads like a wrong answer.
  rejected: 'wrong',
}

// Logged without the address, the code or any token.
function logFailure(step: string, failure: IdentityFailure): void {
  console.warn(JSON.stringify({ event: 'identity_failure', step, kind: failure.kind, detail: failure.detail }))
}

async function withinLimits(dependencies: FlowDependencies, requester: Requester, email?: string): Promise<boolean> {
  if (requester.network !== undefined && !(await dependencies.allow(LIMITS.requestsPerNetwork, requester.network))) return false
  return email === undefined || dependencies.allow(LIMITS.codeEmailsPerAddress, email)
}

type AttemptBase = Omit<Attempt, 'step' | 'session' | 'expiresAt'>

// Sends a sign-in code. An address whose sign-up was never confirmed is sent a new confirmation code instead.
async function startSignIn(dependencies: FlowDependencies, base: AttemptBase): Promise<Begun> {
  const { identity, now } = dependencies
  const started = await identity.startSignIn(base.email)
  if (started.ok) return { ok: true, attempt: { ...base, step: 'answer_sign_in', session: started.value.session, expiresAt: attemptExpiry(now()) } }
  if (started.error.kind !== 'not_confirmed') {
    logFailure('start_sign_in', started.error)
    return { ok: false, notice: notice(started.error) }
  }
  const resent = await identity.resendSignUpCode(base.email)
  if (!resent.ok) {
    logFailure('resend_sign_up_code', resent.error)
    return { ok: false, notice: notice(resent.error) }
  }
  return { ok: true, attempt: { ...base, step: 'confirm_sign_up', expiresAt: attemptExpiry(now()) } }
}

// A new address gets an account and a confirmation code. One that already has an account gets a sign-in code.
async function signUpOrSignIn(dependencies: FlowDependencies, base: AttemptBase): Promise<Begun> {
  const signedUp = await dependencies.identity.signUp(base.email)
  if (signedUp.ok) {
    return { ok: true, attempt: { ...base, step: 'confirm_sign_up', session: signedUp.value?.session, expiresAt: attemptExpiry(dependencies.now()) } }
  }
  if (signedUp.error.kind === 'already_registered') return startSignIn(dependencies, base)
  logFailure('sign_up', signedUp.error)
  return { ok: false, notice: notice(signedUp.error) }
}

// Every address reaches the code step, whatever the identity service said about it, except when it is asked too
// often. An account the service refused, or one it does not know, gets an attempt with no session, which fails as a
// wrong code would. The failure is logged.
export async function beginSignIn(dependencies: FlowDependencies, input: { readonly email: string; readonly language: string }, requester: Requester): Promise<Begun> {
  if (!(await withinLimits(dependencies, requester, input.email))) return { ok: false, notice: 'busy' }
  const base: AttemptBase = { page: 'signIn', email: input.email, language: input.language }
  const begun = await startSignIn(dependencies, base)
  if (begun.ok || begun.notice === 'busy') return begun
  return { ok: true, attempt: { ...base, step: 'answer_sign_in', expiresAt: attemptExpiry(dependencies.now()) } }
}

// The new shop is added to the account once the person is proven: one person may own several shops.
export async function beginSignUp(dependencies: FlowDependencies, input: NewShopInput, requester: Requester): Promise<Begun> {
  if (!(await withinLimits(dependencies, requester, input.email))) return { ok: false, notice: 'busy' }
  return signUpOrSignIn(dependencies, {
    page: 'signUp',
    email: input.email,
    language: input.language,
    newShop: { ownerName: input.name, shopName: input.shopName, timeZone: input.timeZone },
  })
}

// The code goes to the address the owner invited, not one the visitor types.
export async function beginInvitation(
  dependencies: FlowDependencies,
  input: { readonly token: string; readonly name: string; readonly language: string },
  requester: Requester,
): Promise<Begun> {
  const invitation = await findInvitation(dependencies.database, input.token, dependencies.now())
  if (invitation?.state !== 'open') return { ok: false, notice: 'invitation_closed' }
  if (!(await withinLimits(dependencies, requester, invitation.email))) return { ok: false, notice: 'busy' }
  return signUpOrSignIn(dependencies, { page: 'invite', email: invitation.email, language: input.language, invitation: { token: input.token, name: input.name } })
}

export async function resendCode(dependencies: FlowDependencies, attempt: Attempt, requester: Requester): Promise<Begun> {
  if (!(await withinLimits(dependencies, requester, attempt.email))) return { ok: false, notice: 'busy' }
  if (attempt.step === 'answer_sign_in') return startSignIn(dependencies, attempt)
  const resent = await dependencies.identity.resendSignUpCode(attempt.email)
  if (!resent.ok) {
    logFailure('resend_sign_up_code', resent.error)
    return { ok: false, notice: notice(resent.error) }
  }
  return { ok: true, attempt: { ...attempt, expiresAt: attemptExpiry(dependencies.now()) } }
}

async function tokensFor(dependencies: FlowDependencies, attempt: Attempt, code: string): Promise<ProofOutcome | Tokens> {
  const { identity } = dependencies
  if (attempt.step === 'answer_passkey') return { kind: 'failed', failure: 'attempt_over' }
  if (attempt.step === 'answer_sign_in') {
    // An attempt begun without a session fails as a wrong code would, so it looks like any other.
    if (attempt.session === undefined) return { kind: 'failed', failure: 'wrong' }
    const answered = await identity.answerSignInCode(attempt.email, code, { session: attempt.session })
    if (answered.ok) return answered.value
    logFailure('answer_sign_in_code', answered.error)
    return { kind: 'failed', failure: CODE_FAILURES[answered.error.kind] ?? 'unavailable' }
  }
  const confirmed = await identity.confirmSignUp(attempt.email, code, attempt.session === undefined ? undefined : { session: attempt.session })
  if (!confirmed.ok) {
    logFailure('confirm_sign_up', confirmed.error)
    return { kind: 'failed', failure: CODE_FAILURES[confirmed.error.kind] ?? 'unavailable' }
  }
  if (confirmed.value === undefined) {
    const next = await startSignIn(dependencies, attempt)
    return next.ok ? { kind: 'next_code', attempt: next.attempt } : { kind: 'failed', failure: next.notice }
  }
  const signedIn = await identity.signInAfterSignUp(attempt.email, confirmed.value)
  if (signedIn.ok) return signedIn.value
  logFailure('sign_in_after_sign_up', signedIn.error)
  return { kind: 'failed', failure: CODE_FAILURES[signedIn.error.kind] ?? 'unavailable' }
}

// Once the person is proven: create the shop they signed up for, or accept the invitation they followed.
async function afterProof(dependencies: FlowDependencies, attempt: Attempt, tokens: Tokens): Promise<ProofOutcome> {
  const { newShop, invitation } = attempt
  if (newShop === undefined && invitation === undefined) return { kind: 'signed_in', tokens }
  const person = await dependencies.identity.verifyAccessToken(tokens.accessToken)
  if (!person.ok) {
    logFailure('verify_new_member', person.error)
    return { kind: 'failed', failure: 'unavailable' }
  }
  const { subject } = person.value
  try {
    if (newShop !== undefined) {
      await registerOwner(dependencies.database, {
        subject,
        email: attempt.email,
        name: newShop.ownerName,
        language: attempt.language,
        shop: { name: newShop.shopName, timeZone: newShop.timeZone },
      })
    } else if (invitation !== undefined) {
      const accepted = await acceptInvitation(
        dependencies.database,
        { token: invitation.token, subject, email: attempt.email, name: invitation.name, language: attempt.language },
        dependencies.now(),
      )
      if (!accepted.ok) return { kind: 'failed', failure: 'invitation_closed' }
    }
  } catch (error) {
    // The account exists and is confirmed. Trying again reaches this step by a sign-in code. Redacted: a failed
    // query's text carries the person's details.
    console.error(JSON.stringify({ event: 'membership_failed', error: errorForLog(error) }))
    return { kind: 'failed', failure: 'unavailable' }
  }
  // The group is the account type checked at the edge. The role is already safe in the database, so a failure here
  // is logged and the person still signs in.
  const grouped = await dependencies.identity.addToGroup(subject, newShop === undefined ? 'staff' : 'owner')
  if (!grouped.ok) logFailure('add_group', grouped.error)
  return { kind: 'signed_in', tokens }
}

// Checks the code and signs the person in.
export async function answerCode(dependencies: FlowDependencies, attempt: Attempt, code: string, requester: Requester): Promise<ProofOutcome> {
  if (!(await withinLimits(dependencies, requester))) return { kind: 'failed', failure: 'busy' }
  const result = await tokensFor(dependencies, attempt, code)
  return 'kind' in result ? result : afterProof(dependencies, attempt, result)
}

// The browser's options, made the same for every address: the list of the account's credentials is left out, so it
// reveals neither that the account exists nor which passkeys it has. The device offers whichever passkey it holds
// for Hold, and the identity service checks it belongs to the address.
function withoutCredentialList(requestOptions: string): string {
  const parsed = JSON.parse(requestOptions) as Record<string, unknown>
  delete parsed['allowCredentials']
  return JSON.stringify(parsed)
}

// What an address with no passkey, or no account, is answered with on the sign-in page: options of the same shape,
// for an attempt that can only fail as a passkey that is not recognized would.
function decoyOptions(): string {
  return JSON.stringify({ challenge: randomBytes(32).toString('base64url'), userVerification: 'required', timeout: 60_000 })
}

// Asks the browser for a passkey: to sign in, or to confirm an owner who is signed in already.
export async function beginPasskey(
  dependencies: FlowDependencies,
  input: { readonly email: string; readonly language: string; readonly page: 'signIn' | 'confirm'; readonly returnTo?: string },
  requester: Requester,
): Promise<PasskeyBegun> {
  if (!(await withinLimits(dependencies, requester))) return { ok: false, notice: 'busy' }
  const started = await dependencies.identity.startPasskeySignIn(input.email)
  const base: Attempt = {
    page: input.page,
    step: 'answer_passkey',
    email: input.email,
    language: input.language,
    expiresAt: attemptExpiry(dependencies.now()),
    ...(input.returnTo === undefined ? {} : { returnTo: input.returnTo }),
  }
  if (started.ok) return { ok: true, attempt: { ...base, session: started.value.session }, requestOptions: withoutCredentialList(started.value.requestOptions) }
  logFailure('start_passkey', started.error)
  // On the sign-in page, every refusal gets the same answer as a passkey that exists, so the page cannot be used to
  // find accounts: no passkey, no account, or one the service refused. Only too many requests is said plainly.
  // A signed-in person confirming with their own passkey is told what happened.
  if (input.page === 'signIn' && started.error.kind !== 'too_many_requests') return { ok: true, attempt: base, requestOptions: decoyOptions() }
  return { ok: false, notice: notice(started.error) }
}

export async function answerPasskey(dependencies: FlowDependencies, attempt: Attempt, response: string, requester: Requester): Promise<ProofOutcome> {
  if (!(await withinLimits(dependencies, requester))) return { kind: 'failed', failure: 'busy' }
  if (attempt.step !== 'answer_passkey') return { kind: 'failed', failure: 'attempt_over' }
  // A decoy attempt has no session. It fails exactly as a passkey Hold does not recognize.
  if (attempt.session === undefined) return { kind: 'failed', failure: 'wrong' }
  const answered = await dependencies.identity.answerPasskey(attempt.email, response, { session: attempt.session })
  if (answered.ok) return { kind: 'signed_in', tokens: answered.value }
  logFailure('answer_passkey', answered.error)
  return { kind: 'failed', failure: CODE_FAILURES[answered.error.kind] ?? 'unavailable' }
}
