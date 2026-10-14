import type { Result } from '@hold/domain'

// Who owners and staff are. Cognito answers it deployed, a fake in tests (tech-stack.md section 9.1).
// Sign-in is by a code sent to the person's email. There is no password anywhere.

export type IdentityFailure = {
  readonly kind:
    | 'wrong_code'
    | 'code_expired'
    // The attempt is over: it timed out, or too many wrong codes were tried. A new code is needed.
    | 'attempt_expired'
    | 'too_many_requests'
    | 'already_registered'
    | 'not_confirmed'
    // Cognito asked for an authenticator app's code. Hold's pool offers none, so this means a misconfigured pool.
    | 'second_factor_required'
    // The address has no passkey to sign in with.
    | 'no_passkey'
    | 'rejected'
    | 'unavailable'
  // The identity service's own name for the failure, for the logs. Never shown to the person.
  readonly detail?: string
}

export type IdentityResult<Value> = Result<Value, IdentityFailure>

// The identity service's handle on one attempt, carried to the next step. Opaque to Hold.
export type Attempt = { readonly session: string }

export type Tokens = {
  readonly accessToken: string
  // Present when signing in. A refresh keeps the refresh token it was given.
  readonly refreshToken: string | undefined
  readonly expiresInSeconds: number
}

// A passkey sign-in in progress: the identity service's handle, and the options the browser's
// navigator.credentials.get needs, as WebAuthn's JSON.
export type PasskeyAttempt = Attempt & { readonly requestOptions: string }

export type Passkey = { readonly id: string; readonly name: string | undefined; readonly createdAt: Date | undefined }

export type SignedInPerson = {
  // The identity service's stable identifier for the person.
  readonly subject: string
  readonly groups: readonly string[]
}

export type Identity = {
  // Creates an account with no password and emails a code to confirm the address.
  signUp(email: string): Promise<IdentityResult<Attempt | undefined>>
  resendSignUpCode(email: string): Promise<IdentityResult<void>>
  // Confirms the address. Returns an attempt that signs the person in with no second code, when one is given.
  confirmSignUp(email: string, code: string, attempt: Attempt | undefined): Promise<IdentityResult<Attempt | undefined>>
  signInAfterSignUp(email: string, attempt: Attempt): Promise<IdentityResult<Tokens>>
  // Emails a sign-in code. An address with no account gets the same answer, so it cannot be used to find accounts.
  startSignIn(email: string): Promise<IdentityResult<Attempt>>
  answerSignInCode(email: string, code: string, attempt: Attempt): Promise<IdentityResult<Tokens>>
  refresh(refreshToken: string): Promise<IdentityResult<Tokens>>
  signOut(refreshToken: string): Promise<IdentityResult<void>>
  verifyAccessToken(accessToken: string): Promise<IdentityResult<SignedInPerson>>
  // Passkeys with user verification: the device and the person's fingerprint, face or PIN together, which is
  // multi-factor on its own. Registering one needs a signed-in session.
  startPasskeyRegistration(accessToken: string): Promise<IdentityResult<{ readonly creationOptions: string }>>
  finishPasskeyRegistration(accessToken: string, registrationResponse: string): Promise<IdentityResult<void>>
  listPasskeys(accessToken: string): Promise<IdentityResult<readonly Passkey[]>>
  startPasskeySignIn(email: string): Promise<IdentityResult<PasskeyAttempt>>
  answerPasskey(email: string, authenticationResponse: string, attempt: Attempt): Promise<IdentityResult<Tokens>>
  addToGroup(subject: string, group: AccountType): Promise<IdentityResult<void>>
}

// The account types of tech-stack.md section 9.2, held as Cognito groups. A role in a shop is in the database.
export const ACCOUNT_TYPES = ['owner', 'staff', 'platform_admin'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]
