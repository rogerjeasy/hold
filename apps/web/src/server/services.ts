import 'server-only'
import { createHash } from 'node:crypto'
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { createCognitoIdentity, createFakeIdentity } from '@hold/auth'
import type { Identity } from '@hold/auth'
import { loadWebConfig } from '@hold/config'
import type { CookieKeySource, WebConfig } from '@hold/config'
import type { Database } from '@hold/db'
import { createDataApiDatabase } from '@hold/db/data-api'
import { createLazyMailer, createMemoryMailer, createSmtpMailer, loadSmtpSettings } from '@hold/notify'
import type { Mailer } from '@hold/notify'
import { createFakePayPal, createMemoryCredentialStore, createPayPalClient, createRestPayPalHolds, createSecretsManagerCredentialStore } from '@hold/paypal'
import type { CredentialStore, FakePayPal, PayPalCredentials, PayPalHolds } from '@hold/paypal'

// What a PayPal credential check found: the credentials work, PayPal refused them, or PayPal could not be reached.
export type CredentialCheck = 'accepted' | 'refused' | 'unavailable'

// The outside services the web app reaches, built once per server process from its settings.
export type Services = {
  readonly config: WebConfig
  readonly cookieKey: Buffer
  readonly identity: Identity
  readonly database: Database
  readonly mailer: Mailer
  readonly paypalCredentials: CredentialStore
  readonly checkPayPalCredentials: (credentials: PayPalCredentials) => Promise<CredentialCheck>
  // PayPal, acting in the shop account whose credentials the reference names.
  readonly paypalFor: (credentialReference: string) => PayPalHolds
  // The test environment's PayPal, whose orders a simulated approval page approves. Absent everywhere else.
  readonly simulatedPayPal: FakePayPal | undefined
}

// The code the test environment's fake identity sends every time. The end-to-end tests type it.
export const TEST_SIGN_IN_CODE = '24681357'
// The test environment's PayPal check refuses this secret, so a refusal can be tested too.
export const TEST_REFUSED_PAYPAL_SECRET = 'refused-by-paypal'

// The secret holds random text. The key is its SHA-256, which is always the 32 bytes AES-256 needs.
async function loadCookieKey(source: CookieKeySource, region: string): Promise<Buffer> {
  if (source.kind === 'value') return source.key
  const secret = await new SecretsManagerClient({ region }).send(new GetSecretValueCommand({ SecretId: source.secretArn }))
  if (secret.SecretString === undefined || secret.SecretString.length < 32) throw new Error('The cookie key secret is empty or too short.')
  return createHash('sha256').update(secret.SecretString).digest()
}

async function checkWithPayPal(credentials: PayPalCredentials): Promise<CredentialCheck> {
  const client = createPayPalClient({ environment: 'sandbox', credentials: () => Promise.resolve(credentials) })
  const checked = await client.checkCredentials()
  if (checked.ok) return 'accepted'
  return checked.error.kind === 'unavailable' ? 'unavailable' : 'refused'
}

async function build(): Promise<Services> {
  const config = loadWebConfig(process.env)
  if (config.services === 'fake') {
    // Loaded only here, so a deployed server never has PGlite or the fakes in its path.
    const { createTestDatabase } = await import('@hold/db/testing')
    // One PayPal for every shop, which sends the renter to Hold's own simulated approval page.
    const simulatedPayPal = createFakePayPal({ now: () => new Date(), approvalUrl: (orderId) => `${config.publicUrl}/simulated-paypal/${orderId}` })
    return {
      config,
      cookieKey: await loadCookieKey(config.cookieKey, 'us-east-1'),
      identity: createFakeIdentity({ fixedCode: TEST_SIGN_IN_CODE }),
      database: await createTestDatabase(),
      mailer: createMemoryMailer(),
      paypalCredentials: createMemoryCredentialStore(),
      checkPayPalCredentials: (credentials) => Promise.resolve(credentials.clientSecret === TEST_REFUSED_PAYPAL_SECRET ? 'refused' : 'accepted'),
      paypalFor: () => simulatedPayPal,
      simulatedPayPal,
    }
  }
  const paypalCredentials = createSecretsManagerCredentialStore(config.region)
  return {
    config,
    cookieKey: await loadCookieKey(config.cookieKey, config.region),
    identity: createCognitoIdentity({ region: config.region, ...config.cognito }),
    database: createDataApiDatabase({ region: config.region, clusterArn: config.database.clusterArn, secretArn: config.database.secretArn, database: config.database.name }),
    // Through the SMTP account in Secrets Manager, read when the first email is sent.
    mailer: createLazyMailer(async () => createSmtpMailer(await loadSmtpSettings(config.smtpSecret, config.region))),
    paypalCredentials,
    checkPayPalCredentials: checkWithPayPal,
    paypalFor: (credentialReference) =>
      createRestPayPalHolds(
        createPayPalClient({
          environment: config.paypalMode,
          credentials: async () => {
            const credentials = await paypalCredentials.read(credentialReference)
            if (credentials === undefined) throw new Error('The shop’s PayPal credentials are missing.')
            return credentials
          },
        }),
      ),
    simulatedPayPal: undefined,
  }
}

// Kept on globalThis: Next.js may load the proxy and the pages as separate bundles, and both must reach the same
// services. In the test environment, that is what lets a token the pages issued be refreshed by the proxy.
const holder = globalThis as typeof globalThis & { holdServices?: Promise<Services> }

export function getServices(): Promise<Services> {
  holder.holdServices ??= build()
  return holder.holdServices
}
