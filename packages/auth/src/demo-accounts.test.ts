import { describe, expect, it } from 'vitest'
import { ensureDemoAccounts, readDemoAccounts } from './demo-accounts.ts'

const secret = (text: string | undefined) => ({ send: () => Promise.resolve({ SecretString: text }) })
const ACCOUNTS = {
  owner: { email: 'tomas.demo@hold.example', password: 'a'.repeat(24) },
  staff: { email: 'jonas.demo@hold.example', password: 'b'.repeat(24) },
}

describe('the demo accounts secret', () => {
  it('reads the owner and the counter staff', async () => {
    expect(await readDemoAccounts('hold/web/demo-accounts', 'us-east-1', secret(JSON.stringify(ACCOUNTS)))).toEqual(ACCOUNTS)
  })

  it.each([
    ['empty', undefined],
    ['not JSON', 'owner=tomas'],
    ['missing the staff account', JSON.stringify({ owner: ACCOUNTS.owner })],
    ['a short password', JSON.stringify({ ...ACCOUNTS, staff: { ...ACCOUNTS.staff, password: 'short' } })],
    ['an extra field', JSON.stringify({ ...ACCOUNTS, admin: ACCOUNTS.owner })],
  ])('refuses a secret that is %s, without echoing it', async (_case, text) => {
    await expect(readDemoAccounts('hold/web/demo-accounts', 'us-east-1', secret(text))).rejects.toThrow('The demo accounts secret is not in the expected shape.')
  })
})

describe('making sure the demo accounts secret exists', () => {
  const EMAILS = { owner: ACCOUNTS.owner.email, staff: ACCOUNTS.staff.email }

  function secretsManager(existing: string | undefined) {
    const sent: { command: string; input: Record<string, unknown> }[] = []
    const client = {
      send(command: { constructor: { name: string }; input: object }) {
        sent.push({ command: command.constructor.name, input: { ...command.input } })
        if (command.constructor.name === 'GetSecretValueCommand') {
          if (existing !== undefined) return Promise.resolve({ SecretString: existing })
          const missing = new Error('Secrets Manager can’t find the specified secret.')
          missing.name = 'ResourceNotFoundException'
          return Promise.reject(missing)
        }
        return Promise.resolve({})
      },
    }
    return { client, sent }
  }

  it('keeps the passwords already there, so the running app still signs in', async () => {
    const { client, sent } = secretsManager(JSON.stringify(ACCOUNTS))

    expect(await ensureDemoAccounts('hold/web/demo-accounts', EMAILS, 'us-east-1', client)).toEqual(ACCOUNTS)
    expect(sent.map((call) => call.command)).toEqual(['GetSecretValueCommand'])
  })

  it('makes the secret with new random passwords, tagged as Hold’s, when there is none', async () => {
    const { client, sent } = secretsManager(undefined)

    const made = await ensureDemoAccounts('hold/web/demo-accounts', EMAILS, 'us-east-1', client)

    expect(made.owner.email).toBe(EMAILS.owner)
    expect(made.owner.password).not.toBe(made.staff.password)
    // Cognito's default policy: upper and lower case, a digit and a symbol.
    for (const { password } of [made.owner, made.staff]) expect(password).toMatch(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{24,}$/)
    expect(sent[1]).toEqual({
      command: 'CreateSecretCommand',
      input: { Name: 'hold/web/demo-accounts', Description: 'Hold: the demo accounts judges sign in to', SecretString: JSON.stringify(made), Tags: [{ Key: 'project', Value: 'hold' }] },
    })
  })
})
