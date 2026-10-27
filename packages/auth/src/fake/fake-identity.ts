import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import { fail, ok } from '@hold/domain'
import type { AccountType, Identity, IdentityFailure, Passkey, Tokens } from '../identity.ts'

// An identity service in memory, following the rules Cognito follows for Hold's pool: no passwords but the demo
// accounts', a code by
// email to confirm an address and to sign in, an attempt that lasts ten minutes and ends after three wrong codes,
// and the same answer for an address with no account. Tests and the end-to-end run use it.
// Passkeys are recorded by their credential ID and not checked cryptographically: a browser's virtual authenticator
// in the end-to-end run makes real ones, and the fake accepts a sign-in by a credential it registered.

export type FakeIdentityOptions = {
  readonly now?: () => Date
  readonly relyingPartyId?: string
  // Every code is this one. The end-to-end run uses it, because it cannot read email.
  readonly fixedCode?: string
}

export type FakeIdentity = Identity & {
  // The last code emailed to an address, as the person would read it.
  readonly lastCodeFor: (email: string) => string | undefined
  readonly groupsOf: (email: string) => readonly AccountType[]
  // A confirmed account with a password, as the reset script makes the demo accounts. Returns its subject.
  readonly addDemoAccount: (email: string, password: string) => string
  // The relying party passkeys are made for. The end-to-end run serves Hold from localhost.
  readonly relyingPartyId: string
}

type Person = {
  readonly subject: string
  readonly email: string
  confirmed: boolean
  code: string | undefined
  readonly groups: Set<AccountType>
  readonly passkeys: Passkey[]
  readonly password?: string
}
type OpenAttempt = {
  readonly email: string
  readonly purpose: 'sign_in' | 'after_sign_up' | 'passkey'
  readonly expiresAt: number
  wrongCodes: number
}

const ATTEMPT_MILLISECONDS = 10 * 60 * 1000
const ACCESS_TOKEN_SECONDS = 3600
const WRONG_CODES_ALLOWED = 3

const failure = (kind: IdentityFailure['kind']) => fail<IdentityFailure>({ kind })

const challenge = () => randomBytes(32).toString('base64url')

// The credential ID a browser put in its WebAuthn JSON, or nothing for anything else.
function credentialId(response: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(response)
    return typeof parsed === 'object' && parsed !== null && 'id' in parsed && typeof parsed.id === 'string' ? parsed.id : undefined
  } catch {
    return undefined
  }
}

export function createFakeIdentity(options: FakeIdentityOptions = {}): FakeIdentity {
  const now = () => (options.now ?? (() => new Date()))().getTime()
  const people = new Map<string, Person>()
  const attempts = new Map<string, OpenAttempt>()
  const accessTokens = new Map<string, { subject: string; expiresAt: number }>()
  const refreshTokens = new Map<string, string>()
  const lastCodes = new Map<string, string>()
  const relyingPartyId = options.relyingPartyId ?? 'localhost'

  const key = (email: string) => email.toLowerCase()
  const personWith = (subject: string) => [...people.values()].find((candidate) => candidate.subject === subject)
  const tokenHolder = (accessToken: string) => {
    const issued = accessTokens.get(accessToken)
    return issued === undefined || issued.expiresAt <= now() ? undefined : personWith(issued.subject)
  }

  function email(address: string, person: Person | undefined): void {
    const code = options.fixedCode ?? String(randomInt(0, 100_000_000)).padStart(8, '0')
    if (person !== undefined) person.code = code
    lastCodes.set(key(address), code)
  }

  function open(address: string, purpose: OpenAttempt['purpose']): { session: string } {
    const session = randomUUID()
    attempts.set(session, { email: key(address), purpose, expiresAt: now() + ATTEMPT_MILLISECONDS, wrongCodes: 0 })
    return { session }
  }

  function issue(subject: string, refreshToken: string | undefined): Tokens {
    const accessToken = `fake-access-${randomUUID()}`
    accessTokens.set(accessToken, { subject, expiresAt: now() + ACCESS_TOKEN_SECONDS * 1000 })
    return { accessToken, refreshToken, expiresInSeconds: ACCESS_TOKEN_SECONDS }
  }

  function signInTokens(person: Person): Tokens {
    const refreshToken = `fake-refresh-${randomUUID()}`
    refreshTokens.set(refreshToken, person.subject)
    return issue(person.subject, refreshToken)
  }

  return {
    relyingPartyId,
    lastCodeFor: (address) => lastCodes.get(key(address)),
    groupsOf: (address) => [...(people.get(key(address))?.groups ?? [])],
    addDemoAccount(address, password) {
      const person: Person = { subject: randomUUID(), email: key(address), confirmed: true, code: undefined, groups: new Set(), passkeys: [], password }
      people.set(key(address), person)
      return person.subject
    },

    signUp(address) {
      if (people.has(key(address))) return Promise.resolve(failure('already_registered'))
      const person: Person = { subject: randomUUID(), email: key(address), confirmed: false, code: undefined, groups: new Set(), passkeys: [] }
      people.set(key(address), person)
      email(address, person)
      return Promise.resolve(ok(open(address, 'after_sign_up')))
    },

    resendSignUpCode(address) {
      const person = people.get(key(address))
      if (person !== undefined && !person.confirmed) email(address, person)
      return Promise.resolve(ok(undefined))
    },

    confirmSignUp(address, code, previous) {
      const person = people.get(key(address))
      if (person === undefined || person.confirmed || person.code !== code) return Promise.resolve(failure('wrong_code'))
      person.confirmed = true
      person.code = undefined
      return Promise.resolve(ok(previous === undefined ? undefined : open(address, 'after_sign_up')))
    },

    signInAfterSignUp(address, confirmed) {
      const opened = attempts.get(confirmed.session)
      const person = people.get(key(address))
      attempts.delete(confirmed.session)
      if (opened?.purpose !== 'after_sign_up' || opened.email !== key(address) || person?.confirmed !== true || opened.expiresAt <= now()) {
        return Promise.resolve(failure('attempt_expired'))
      }
      return Promise.resolve(ok(signInTokens(person)))
    },

    startSignIn(address) {
      const person = people.get(key(address))
      if (person !== undefined && !person.confirmed) return Promise.resolve(failure('not_confirmed'))
      // An address with no account gets an attempt too, and no email.
      if (person !== undefined) email(address, person)
      return Promise.resolve(ok(open(address, 'sign_in')))
    },

    answerSignInCode(address, code, started) {
      const opened = attempts.get(started.session)
      if (opened?.purpose !== 'sign_in' || opened.email !== key(address) || opened.expiresAt <= now()) {
        return Promise.resolve(failure('attempt_expired'))
      }
      const person = people.get(key(address))
      if (person?.code === undefined || person.code !== code) {
        opened.wrongCodes += 1
        if (opened.wrongCodes >= WRONG_CODES_ALLOWED) attempts.delete(started.session)
        return Promise.resolve(failure('wrong_code'))
      }
      attempts.delete(started.session)
      person.code = undefined
      return Promise.resolve(ok(signInTokens(person)))
    },

    signInWithPassword(address, password) {
      const person = people.get(key(address))
      if (person?.password === undefined || person.password !== password) return Promise.resolve(failure('rejected'))
      return Promise.resolve(ok(signInTokens(person)))
    },

    refresh(refreshToken) {
      const subject = refreshTokens.get(refreshToken)
      return Promise.resolve(subject === undefined ? failure('rejected') : ok(issue(subject, refreshToken)))
    },

    signOut(refreshToken) {
      refreshTokens.delete(refreshToken)
      return Promise.resolve(ok(undefined))
    },

    verifyAccessToken(accessToken) {
      const person = tokenHolder(accessToken)
      return Promise.resolve(person === undefined ? failure('rejected') : ok({ subject: person.subject, groups: [...person.groups] }))
    },

    startPasskeyRegistration(accessToken) {
      const person = tokenHolder(accessToken)
      if (person === undefined) return Promise.resolve(failure('rejected'))
      const creationOptions = {
        challenge: challenge(),
        rp: { id: relyingPartyId, name: 'Hold' },
        user: { id: Buffer.from(person.subject).toString('base64url'), name: person.email, displayName: person.email },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        excludeCredentials: person.passkeys.map((passkey) => ({ type: 'public-key', id: passkey.id })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        timeout: 60_000,
      }
      return Promise.resolve(ok({ creationOptions: JSON.stringify(creationOptions) }))
    },

    finishPasskeyRegistration(accessToken, registrationResponse) {
      const person = tokenHolder(accessToken)
      const id = credentialId(registrationResponse)
      if (person === undefined || id === undefined) return Promise.resolve(failure('rejected'))
      person.passkeys.push({ id, name: undefined, createdAt: new Date(now()) })
      return Promise.resolve(ok(undefined))
    },

    listPasskeys(accessToken) {
      const person = tokenHolder(accessToken)
      return Promise.resolve(person === undefined ? failure('rejected') : ok([...person.passkeys]))
    },

    startPasskeySignIn(address) {
      const person = people.get(key(address))
      if (person === undefined || person.passkeys.length === 0) return Promise.resolve(failure('no_passkey'))
      const requestOptions = {
        challenge: challenge(),
        rpId: relyingPartyId,
        allowCredentials: person.passkeys.map((passkey) => ({ type: 'public-key', id: passkey.id })),
        userVerification: 'required',
        timeout: 60_000,
      }
      return Promise.resolve(ok({ ...open(address, 'passkey'), requestOptions: JSON.stringify(requestOptions) }))
    },

    answerPasskey(address, authenticationResponse, started) {
      const opened = attempts.get(started.session)
      attempts.delete(started.session)
      const person = people.get(key(address))
      const id = credentialId(authenticationResponse)
      if (opened?.purpose !== 'passkey' || opened.email !== key(address) || opened.expiresAt <= now() || person === undefined) {
        return Promise.resolve(failure('attempt_expired'))
      }
      if (!person.passkeys.some((passkey) => passkey.id === id)) return Promise.resolve(failure('rejected'))
      return Promise.resolve(ok(signInTokens(person)))
    },

    addToGroup(subject, group) {
      const person = personWith(subject)
      if (person === undefined) return Promise.resolve(failure('rejected'))
      person.groups.add(group)
      return Promise.resolve(ok(undefined))
    },
  }
}
