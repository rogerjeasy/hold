import {
  AdminAddUserToGroupCommand,
  CognitoIdentityProviderClient,
  CompleteWebAuthnRegistrationCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  ListWebAuthnCredentialsCommand,
  ResendConfirmationCodeCommand,
  RespondToAuthChallengeCommand,
  RevokeTokenCommand,
  SignUpCommand,
  StartWebAuthnRegistrationCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import type { AuthenticationResultType, InitiateAuthCommandOutput } from '@aws-sdk/client-cognito-identity-provider'
import { fail, ok } from '@hold/domain'
import { CognitoJwtVerifier } from 'aws-jwt-verify'
import type { Identity, IdentityFailure, IdentityResult, Tokens } from '../identity.ts'

export type CognitoSettings = {
  readonly region: string
  readonly userPoolId: string
  readonly clientId: string
}

// Cognito's exception names, mapped to what Hold tells the person.
const FAILURES: Readonly<Record<string, IdentityFailure['kind']>> = {
  CodeMismatchException: 'wrong_code',
  ExpiredCodeException: 'code_expired',
  // Raised for a timed-out attempt, and once too many wrong codes were tried on it.
  NotAuthorizedException: 'attempt_expired',
  UsernameExistsException: 'already_registered',
  UserNotConfirmedException: 'not_confirmed',
  // With user-existence errors prevented, Cognito should not say this. If it does, it reads like a wrong code.
  UserNotFoundException: 'wrong_code',
  LimitExceededException: 'too_many_requests',
  TooManyRequestsException: 'too_many_requests',
  TooManyFailedAttemptsException: 'too_many_requests',
  InvalidParameterException: 'rejected',
}

function failure(error: unknown): { readonly ok: false; readonly error: IdentityFailure } {
  const name = error instanceof Error ? error.name : 'unknown'
  return fail({ kind: FAILURES[name] ?? 'unavailable', detail: name })
}

async function attempt<Value>(work: () => Promise<IdentityResult<Value>>): Promise<IdentityResult<Value>> {
  try {
    return await work()
  } catch (error) {
    return failure(error)
  }
}

function tokens(result: AuthenticationResultType | undefined, refreshToken?: string): IdentityResult<Tokens> {
  if (result?.AccessToken === undefined || result.ExpiresIn === undefined) return fail({ kind: 'unavailable', detail: 'no tokens' })
  return ok({ accessToken: result.AccessToken, refreshToken: result.RefreshToken ?? refreshToken, expiresInSeconds: result.ExpiresIn })
}

function signedIn(output: { AuthenticationResult?: AuthenticationResultType; ChallengeName?: string }): IdentityResult<Tokens> {
  if (output.ChallengeName === 'SOFTWARE_TOKEN_MFA') return fail({ kind: 'second_factor_required', detail: output.ChallengeName })
  return tokens(output.AuthenticationResult)
}

// The client is passed in only by tests, which answer as Cognito would.
export function createCognitoIdentity(
  settings: CognitoSettings,
  client: Pick<CognitoIdentityProviderClient, 'send'> = new CognitoIdentityProviderClient({ region: settings.region }),
): Identity {
  const ClientId = settings.clientId
  const verifier = CognitoJwtVerifier.create({ userPoolId: settings.userPoolId, tokenUse: 'access', clientId: ClientId })

  // Reaches the challenge asked for. Cognito may first ask which way to sign in, even when told the preferred one.
  async function challenge(
    email: string,
    wanted: 'EMAIL_OTP' | 'WEB_AUTHN',
    output: InitiateAuthCommandOutput,
  ): Promise<IdentityResult<{ session: string; parameters: Record<string, string> }>> {
    let { ChallengeName, Session, ChallengeParameters } = output
    if (ChallengeName === 'SELECT_CHALLENGE') {
      // The choices on offer. A person with no passkey is not offered WEB_AUTHN.
      const offered = (ChallengeParameters?.['AVAILABLE_CHALLENGES'] ?? '').split(',').map((name) => name.trim().replace(/[[\]"]/g, ''))
      if (wanted === 'WEB_AUTHN' && offered.length > 0 && offered[0] !== '' && !offered.includes('WEB_AUTHN')) {
        return fail({ kind: 'no_passkey', detail: 'WEB_AUTHN not offered' })
      }
      const chosen = await client.send(
        new RespondToAuthChallengeCommand({ ClientId, ChallengeName: 'SELECT_CHALLENGE', Session, ChallengeResponses: { USERNAME: email, ANSWER: wanted } }),
      )
      ;({ ChallengeName, Session, ChallengeParameters } = chosen)
    }
    if (ChallengeName !== wanted || Session === undefined) {
      return fail({ kind: wanted === 'WEB_AUTHN' ? 'no_passkey' : 'unavailable', detail: `challenge ${String(ChallengeName)}` })
    }
    return ok({ session: Session, parameters: ChallengeParameters ?? {} })
  }

  return {
    signUp: (email) =>
      attempt(async () => {
        const output = await client.send(new SignUpCommand({ ClientId, Username: email, UserAttributes: [{ Name: 'email', Value: email }] }))
        return ok(output.Session === undefined ? undefined : { session: output.Session })
      }),

    resendSignUpCode: (email) =>
      attempt(async () => {
        await client.send(new ResendConfirmationCodeCommand({ ClientId, Username: email }))
        return ok(undefined)
      }),

    confirmSignUp: (email, code, previous) =>
      attempt(async () => {
        const output = await client.send(new ConfirmSignUpCommand({ ClientId, Username: email, ConfirmationCode: code, Session: previous?.session }))
        return ok(output.Session === undefined ? undefined : { session: output.Session })
      }),

    signInAfterSignUp: (email, confirmed) =>
      attempt(async () =>
        signedIn(await client.send(new InitiateAuthCommand({ ClientId, AuthFlow: 'USER_AUTH', AuthParameters: { USERNAME: email }, Session: confirmed.session }))),
      ),

    startSignIn: (email) =>
      attempt(async () => {
        const output = await client.send(
          new InitiateAuthCommand({ ClientId, AuthFlow: 'USER_AUTH', AuthParameters: { USERNAME: email, PREFERRED_CHALLENGE: 'EMAIL_OTP' } }),
        )
        const reached = await challenge(email, 'EMAIL_OTP', output)
        return reached.ok ? ok({ session: reached.value.session }) : reached
      }),

    answerSignInCode: (email, code, started) =>
      attempt(async () =>
        signedIn(
          await client.send(
            new RespondToAuthChallengeCommand({
              ClientId,
              ChallengeName: 'EMAIL_OTP',
              Session: started.session,
              ChallengeResponses: { USERNAME: email, EMAIL_OTP_CODE: code },
            }),
          ),
        ),
      ),

    refresh: (refreshToken) =>
      attempt(async () => {
        const output = await client.send(new InitiateAuthCommand({ ClientId, AuthFlow: 'REFRESH_TOKEN_AUTH', AuthParameters: { REFRESH_TOKEN: refreshToken } }))
        return tokens(output.AuthenticationResult, refreshToken)
      }),

    signOut: (refreshToken) =>
      attempt(async () => {
        await client.send(new RevokeTokenCommand({ ClientId, Token: refreshToken }))
        return ok(undefined)
      }),

    async verifyAccessToken(accessToken) {
      try {
        const payload = await verifier.verify(accessToken)
        return ok({ subject: payload.sub, groups: payload['cognito:groups'] ?? [] })
      } catch {
        return fail({ kind: 'rejected', detail: 'access token not valid' })
      }
    },

    startPasskeyRegistration: (accessToken) =>
      attempt(async () => {
        const output = await client.send(new StartWebAuthnRegistrationCommand({ AccessToken: accessToken }))
        if (output.CredentialCreationOptions === undefined) return fail({ kind: 'unavailable', detail: 'no creation options' })
        return ok({ creationOptions: JSON.stringify(output.CredentialCreationOptions) })
      }),

    finishPasskeyRegistration: (accessToken, registrationResponse) =>
      attempt(async () => {
        await client.send(new CompleteWebAuthnRegistrationCommand({ AccessToken: accessToken, Credential: JSON.parse(registrationResponse) as Record<string, never> }))
        return ok(undefined)
      }),

    listPasskeys: (accessToken) =>
      attempt(async () => {
        const output = await client.send(new ListWebAuthnCredentialsCommand({ AccessToken: accessToken }))
        return ok(
          (output.Credentials ?? []).flatMap((credential) =>
            credential.CredentialId === undefined
              ? []
              : [{ id: credential.CredentialId, name: credential.FriendlyCredentialName, createdAt: credential.CreatedAt }],
          ),
        )
      }),

    startPasskeySignIn: (email) =>
      attempt(async () => {
        const output = await client.send(
          new InitiateAuthCommand({ ClientId, AuthFlow: 'USER_AUTH', AuthParameters: { USERNAME: email, PREFERRED_CHALLENGE: 'WEB_AUTHN' } }),
        )
        const reached = await challenge(email, 'WEB_AUTHN', output)
        if (!reached.ok) return reached
        const requestOptions = reached.value.parameters['CREDENTIAL_REQUEST_OPTIONS']
        if (requestOptions === undefined) return fail({ kind: 'no_passkey', detail: 'no request options' })
        return ok({ session: reached.value.session, requestOptions })
      }),

    answerPasskey: (email, authenticationResponse, started) =>
      attempt(async () =>
        signedIn(
          await client.send(
            new RespondToAuthChallengeCommand({
              ClientId,
              ChallengeName: 'WEB_AUTHN',
              Session: started.session,
              ChallengeResponses: { USERNAME: email, CREDENTIAL: authenticationResponse },
            }),
          ),
        ),
      ),

    addToGroup: (subject, group) =>
      attempt(async () => {
        await client.send(new AdminAddUserToGroupCommand({ UserPoolId: settings.userPoolId, Username: subject, GroupName: group }))
        return ok(undefined)
      }),
  }
}
