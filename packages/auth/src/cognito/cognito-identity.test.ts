import { describe, expect, it } from 'vitest'
import { createCognitoIdentity } from './cognito-identity.ts'

type Sent = { readonly command: string; readonly input: Record<string, unknown> }
type Reply = Record<string, unknown> | Error

// Answers each command in turn, the way Cognito would, and records what was sent.
function cognito(replies: readonly Reply[]) {
  const sent: Sent[] = []
  let next = 0
  const client = {
    send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
      sent.push({ command: command.constructor.name, input: command.input })
      const reply = replies[next++]
      if (reply === undefined) throw new Error('No reply left.')
      return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply)
    },
  }
  const identity = createCognitoIdentity({ region: 'us-east-1', userPoolId: 'us-east-1_2kEqBx3YP', clientId: 'web-client' }, client)
  return { identity, sent }
}

function cognitoError(name: string): Error {
  const error = new Error(`Cognito says ${name}`)
  error.name = name
  return error
}

const AUTHENTICATED = { AuthenticationResult: { AccessToken: 'access', RefreshToken: 'refresh', ExpiresIn: 3600 } }

describe('the Cognito identity', () => {
  it('signs up with no password and keeps the session for signing in after', async () => {
    const { identity, sent } = cognito([{ UserConfirmed: false, Session: 'after-sign-up' }])

    expect(await identity.signUp('tomas@ribeirabikes.example')).toEqual({ ok: true, value: { session: 'after-sign-up' } })
    expect(sent).toEqual([
      {
        command: 'SignUpCommand',
        input: { ClientId: 'web-client', Username: 'tomas@ribeirabikes.example', UserAttributes: [{ Name: 'email', Value: 'tomas@ribeirabikes.example' }] },
      },
    ])
  })

  it('asks for the email code, choosing it when Cognito asks which way to sign in', async () => {
    const { identity, sent } = cognito([
      { ChallengeName: 'SELECT_CHALLENGE', Session: 'select' },
      { ChallengeName: 'EMAIL_OTP', Session: 'email-code' },
    ])

    expect(await identity.startSignIn('tomas@ribeirabikes.example')).toEqual({ ok: true, value: { session: 'email-code' } })
    expect(sent.map((call) => call.input['ChallengeResponses'] ?? call.input['AuthParameters'])).toEqual([
      { USERNAME: 'tomas@ribeirabikes.example', PREFERRED_CHALLENGE: 'EMAIL_OTP' },
      { USERNAME: 'tomas@ribeirabikes.example', ANSWER: 'EMAIL_OTP' },
    ])
  })

  it('returns the tokens for a right code', async () => {
    const { identity, sent } = cognito([AUTHENTICATED])

    expect(await identity.answerSignInCode('tomas@ribeirabikes.example', '12345678', { session: 'email-code' })).toEqual({
      ok: true,
      value: { accessToken: 'access', refreshToken: 'refresh', expiresInSeconds: 3600 },
    })
    expect(sent[0]?.input).toMatchObject({ ChallengeName: 'EMAIL_OTP', Session: 'email-code', ChallengeResponses: { EMAIL_OTP_CODE: '12345678' } })
  })

  it('says an authenticator code is needed, which Hold does not take yet', async () => {
    const { identity } = cognito([{ ChallengeName: 'SOFTWARE_TOKEN_MFA', Session: 'mfa' }])

    expect(await identity.answerSignInCode('owner@shop.example', '12345678', { session: 'email-code' })).toMatchObject({
      ok: false,
      error: { kind: 'second_factor_required' },
    })
  })

  it('keeps the refresh token it was given when refreshing', async () => {
    const { identity } = cognito([{ AuthenticationResult: { AccessToken: 'new-access', ExpiresIn: 3600 } }])

    expect(await identity.refresh('refresh')).toEqual({ ok: true, value: { accessToken: 'new-access', refreshToken: 'refresh', expiresInSeconds: 3600 } })
  })

  it('starts a passkey sign-in and hands back the browser’s request options', async () => {
    const { identity } = cognito([{ ChallengeName: 'WEB_AUTHN', Session: 'passkey', ChallengeParameters: { CREDENTIAL_REQUEST_OPTIONS: '{"rpId":"localhost"}' } }])

    expect(await identity.startPasskeySignIn('owner@shop.example')).toEqual({ ok: true, value: { session: 'passkey', requestOptions: '{"rpId":"localhost"}' } })
  })

  it('says there is no passkey when Cognito does not offer one', async () => {
    const { identity } = cognito([{ ChallengeName: 'SELECT_CHALLENGE', Session: 's', ChallengeParameters: { AVAILABLE_CHALLENGES: '["EMAIL_OTP"]' } }])

    expect(await identity.startPasskeySignIn('owner@shop.example')).toMatchObject({ ok: false, error: { kind: 'no_passkey' } })
  })

  it('sends the passkey’s answer as the WEB_AUTHN credential', async () => {
    const { identity, sent } = cognito([AUTHENTICATED])

    expect((await identity.answerPasskey('owner@shop.example', '{"id":"c"}', { session: 'passkey' })).ok).toBe(true)
    expect(sent[0]?.input).toMatchObject({ ChallengeName: 'WEB_AUTHN', ChallengeResponses: { CREDENTIAL: '{"id":"c"}' } })
  })

  it('registers a passkey with the person’s own access token', async () => {
    const { identity, sent } = cognito([{ CredentialCreationOptions: { rp: { id: 'localhost' } } }, {}])

    expect(await identity.startPasskeyRegistration('access')).toEqual({ ok: true, value: { creationOptions: '{"rp":{"id":"localhost"}}' } })
    expect((await identity.finishPasskeyRegistration('access', '{"id":"c"}')).ok).toBe(true)
    expect(sent.map((call) => call.command)).toEqual(['StartWebAuthnRegistrationCommand', 'CompleteWebAuthnRegistrationCommand'])
  })

  it.each([
    ['CodeMismatchException', 'wrong_code'],
    ['ExpiredCodeException', 'code_expired'],
    ['NotAuthorizedException', 'attempt_expired'],
    ['UsernameExistsException', 'already_registered'],
    ['UserNotConfirmedException', 'not_confirmed'],
    ['LimitExceededException', 'too_many_requests'],
    ['TooManyRequestsException', 'too_many_requests'],
    ['InternalErrorException', 'unavailable'],
  ])('names %s as %s', async (name, kind) => {
    const { identity } = cognito([cognitoError(name)])

    expect(await identity.confirmSignUp('tomas@ribeirabikes.example', '123456', undefined)).toEqual({ ok: false, error: { kind, detail: name } })
  })

  it('reports a network failure as unavailable instead of throwing', async () => {
    const { identity } = cognito([new TypeError('fetch failed')])

    expect(await identity.startSignIn('tomas@ribeirabikes.example')).toMatchObject({ ok: false, error: { kind: 'unavailable' } })
  })

  it('refuses an access token it did not issue', async () => {
    const { identity } = cognito([])

    expect(await identity.verifyAccessToken('not-a-token')).toMatchObject({ ok: false, error: { kind: 'rejected' } })
  })
})
