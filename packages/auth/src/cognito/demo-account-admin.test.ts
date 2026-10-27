import { describe, expect, it } from 'vitest'
import { createDemoAccountAdmin } from './demo-account-admin.ts'

type Sent = { readonly command: string; readonly input: Record<string, unknown> }
type Reply = Record<string, unknown> | Error

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
  return { admin: createDemoAccountAdmin({ region: 'us-east-1', userPoolId: 'us-east-1_2kEqBx3YP', clientId: 'web-client' }, client), sent }
}

function notFound(): Error {
  const error = new Error('User does not exist.')
  error.name = 'UserNotFoundException'
  return error
}

const ACCOUNT = { email: 'tomas.demo@hold.example', password: 'a-long-random-password-Aa1!', group: 'owner' } as const
const SIGNED_IN = { AuthenticationResult: { AccessToken: 'demo-access', ExpiresIn: 3600 } }

describe('preparing a demo account', () => {
  it('creates a missing account, confirmed and silent, with its password and group', async () => {
    const { admin, sent } = cognito([notFound(), { User: { Attributes: [{ Name: 'sub', Value: 'new-subject' }] } }, {}, {}, SIGNED_IN, { Credentials: [] }, {}])

    expect(await admin.prepare(ACCOUNT)).toEqual({ subject: 'new-subject', passkeysRemoved: 0 })
    expect(sent.map((call) => call.command)).toEqual([
      'AdminGetUserCommand',
      'AdminCreateUserCommand',
      'AdminSetUserPasswordCommand',
      'AdminAddUserToGroupCommand',
      'InitiateAuthCommand',
      'ListWebAuthnCredentialsCommand',
      'AdminUserGlobalSignOutCommand',
    ])
    expect(sent[1]?.input).toEqual({
      UserPoolId: 'us-east-1_2kEqBx3YP',
      Username: ACCOUNT.email,
      MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email', Value: ACCOUNT.email },
        { Name: 'email_verified', Value: 'true' },
      ],
    })
    expect(sent[2]?.input).toEqual({ UserPoolId: 'us-east-1_2kEqBx3YP', Username: ACCOUNT.email, Password: ACCOUNT.password, Permanent: true })
    expect(sent[4]?.input).toEqual({
      ClientId: 'web-client',
      AuthFlow: 'USER_AUTH',
      AuthParameters: { USERNAME: ACCOUNT.email, PREFERRED_CHALLENGE: 'PASSWORD', PASSWORD: ACCOUNT.password },
    })
  })

  it('removes every passkey judges added and ends their sessions', async () => {
    const { admin, sent } = cognito([
      { UserAttributes: [{ Name: 'sub', Value: 'old-subject' }] },
      {},
      {},
      SIGNED_IN,
      { Credentials: [{ CredentialId: 'first' }, { CredentialId: 'second' }] },
      {},
      {},
      {},
    ])

    expect(await admin.prepare(ACCOUNT)).toEqual({ subject: 'old-subject', passkeysRemoved: 2 })
    expect(sent.filter((call) => call.command === 'DeleteWebAuthnCredentialCommand').map((call) => call.input)).toEqual([
      { AccessToken: 'demo-access', CredentialId: 'first' },
      { AccessToken: 'demo-access', CredentialId: 'second' },
    ])
    expect(sent.at(-1)).toEqual({ command: 'AdminUserGlobalSignOutCommand', input: { UserPoolId: 'us-east-1_2kEqBx3YP', Username: ACCOUNT.email } })
  })
})
