import { describe, expect, it } from 'vitest'
import { createDemoSessionAccounts } from './demo-session-accounts.ts'

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
  return { accounts: createDemoSessionAccounts({ region: 'us-east-1', userPoolId: 'us-east-1_2kEqBx3YP', clientId: 'web-client' }, client), sent }
}

const ACCOUNT = { email: 'tomas.k3v9q2@demo.hold.example', password: 'a-long-random-password-Aa1!', group: 'owner' } as const
const CREATED = { User: { Attributes: [{ Name: 'sub', Value: 'new-subject' }] } }
const NEW_PASSWORD = { ChallengeName: 'NEW_PASSWORD_REQUIRED', Session: 'challenge-session' }
const SIGNED_IN = { AuthenticationResult: { AccessToken: 'demo-access', ExpiresIn: 3600 } }

describe('making the accounts of one demo session', () => {
  // The app may create a user and add it to a group, and nothing else: it never sets an existing person's password.
  it('creates a confirmed, silent account, gives it its password through the first sign-in, and adds its group', async () => {
    const { accounts, sent } = cognito([CREATED, NEW_PASSWORD, SIGNED_IN, {}])

    expect(await accounts.create(ACCOUNT)).toBe('new-subject')
    expect(sent.map((call) => call.command)).toEqual(['AdminCreateUserCommand', 'InitiateAuthCommand', 'RespondToAuthChallengeCommand', 'AdminAddUserToGroupCommand'])
    const temporary = sent[0]?.input['TemporaryPassword']
    expect(sent[0]?.input).toEqual({
      UserPoolId: 'us-east-1_2kEqBx3YP',
      Username: ACCOUNT.email,
      MessageAction: 'SUPPRESS',
      TemporaryPassword: temporary,
      UserAttributes: [
        { Name: 'email', Value: ACCOUNT.email },
        { Name: 'email_verified', Value: 'true' },
      ],
    })
    expect(temporary).not.toBe(ACCOUNT.password)
    expect(sent[1]?.input).toEqual({ ClientId: 'web-client', AuthFlow: 'USER_AUTH', AuthParameters: { USERNAME: ACCOUNT.email, PREFERRED_CHALLENGE: 'PASSWORD', PASSWORD: temporary } })
    expect(sent[2]?.input).toEqual({
      ClientId: 'web-client',
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      Session: 'challenge-session',
      ChallengeResponses: { USERNAME: ACCOUNT.email, NEW_PASSWORD: ACCOUNT.password },
    })
    expect(sent[3]?.input).toEqual({ UserPoolId: 'us-east-1_2kEqBx3YP', Username: ACCOUNT.email, GroupName: 'owner' })
  })

  it('answers Cognito’s question of which way to sign in before setting the password', async () => {
    const { accounts, sent } = cognito([CREATED, { ChallengeName: 'SELECT_CHALLENGE', Session: 'select-session' }, NEW_PASSWORD, SIGNED_IN, {}])

    expect(await accounts.create(ACCOUNT)).toBe('new-subject')
    expect(sent[2]?.input).toMatchObject({ ChallengeName: 'SELECT_CHALLENGE', Session: 'select-session', ChallengeResponses: { USERNAME: ACCOUNT.email, ANSWER: 'PASSWORD' } })
  })

  it('refuses an address outside the demo’s own domain without calling Cognito', async () => {
    const { accounts, sent } = cognito([])

    await expect(accounts.create({ ...ACCOUNT, email: 'owner@ribeira-bikes.pt' })).rejects.toThrow('demo.hold.example')
    expect(sent).toEqual([])
  })

  it('stops when the account already exists, and never changes it', async () => {
    const exists = new Error('User account already exists')
    exists.name = 'UsernameExistsException'
    const { accounts, sent } = cognito([exists])

    await expect(accounts.create(ACCOUNT)).rejects.toThrow('already exists')
    expect(sent.map((call) => call.command)).toEqual(['AdminCreateUserCommand'])
  })

  it('stops when the first sign-in does not ask for the new password', async () => {
    const { accounts } = cognito([CREATED, SIGNED_IN])

    await expect(accounts.create(ACCOUNT)).rejects.toThrow('NEW_PASSWORD_REQUIRED')
  })
})
