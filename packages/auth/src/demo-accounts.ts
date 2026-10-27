import { randomBytes } from 'node:crypto'
import { CreateSecretCommand, GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { z } from 'zod'

// The demo accounts judges sign in to with one tap (architecture.md section 20.3). Their passwords live only in this
// secret, which the reset script writes and the web app reads. No judge ever sees one.

export const DEMO_ACCOUNT_KEYS = ['owner', 'staff'] as const
export type DemoAccountKey = (typeof DEMO_ACCOUNT_KEYS)[number]

const account = z.object({ email: z.email(), password: z.string().min(24).max(256) }).strict()
export const demoAccountsSchema = z.object({ owner: account, staff: account }).strict()
export type DemoAccounts = z.infer<typeof demoAccountsSchema>

type Client = { send: (command: GetSecretValueCommand) => Promise<{ readonly SecretString?: string | undefined }> }
type AdminClient = { send: (command: GetSecretValueCommand | CreateSecretCommand) => Promise<{ readonly SecretString?: string | undefined }> }

export async function readDemoAccounts(secretId: string, region: string, client: Client = new SecretsManagerClient({ region })): Promise<DemoAccounts> {
  const secret = await client.send(new GetSecretValueCommand({ SecretId: secretId }))
  let parsed: unknown
  try {
    parsed = JSON.parse(secret.SecretString ?? '')
  } catch {
    parsed = undefined
  }
  const accounts = demoAccountsSchema.safeParse(parsed)
  // Says nothing of what the secret holds: a password must not reach a log.
  if (!accounts.success) throw new Error('The demo accounts secret is not in the expected shape.')
  return accounts.data
}

// Random, and always meeting Cognito's default policy: upper and lower case, a digit and a symbol.
function newPassword(): string {
  return `${randomBytes(24).toString('base64url')}Aa1!`
}

// For the reset script, as an administrator. Keeps the passwords already in the secret, so a running app that read it
// still signs in; makes it, with new passwords, when there is none.
export async function ensureDemoAccounts(
  secretName: string,
  emails: Readonly<Record<DemoAccountKey, string>>,
  region: string,
  client: AdminClient = new SecretsManagerClient({ region }),
): Promise<DemoAccounts> {
  try {
    return await readDemoAccounts(secretName, region, client)
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'ResourceNotFoundException') throw error
  }
  const accounts = demoAccountsSchema.parse({ owner: { email: emails.owner, password: newPassword() }, staff: { email: emails.staff, password: newPassword() } })
  await client.send(
    new CreateSecretCommand({ Name: secretName, Description: 'Hold: the demo accounts judges sign in to', SecretString: JSON.stringify(accounts), Tags: [{ Key: 'project', Value: 'hold' }] }),
  )
  return accounts
}
