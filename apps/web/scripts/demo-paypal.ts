import { createPayPalClient, createSecretsManagerCredentialStore, DEMO_CREDENTIAL_OWNER } from '@hold/paypal'

// Stores the demo's PayPal sandbox connection (architecture.md section 20.3), as an administrator:
//   PAYPAL_SANDBOX_CLIENT_ID=… PAYPAL_SANDBOX_CLIENT_SECRET=… AWS_PROFILE=… pnpm demo:paypal
// Every demo a judge starts opens a shop of its own that shares this one sandbox account, so a booking, a hold and a
// capture are real PayPal sandbox calls. The credentials are checked with PayPal first, and kept only in Secrets
// Manager. Safe to run again: it replaces what is stored.

function setting(name: 'PAYPAL_SANDBOX_CLIENT_ID' | 'PAYPAL_SANDBOX_CLIENT_SECRET'): string {
  const value = process.env[name]
  if (value === undefined || value === '') throw new Error(`${name} is not set.`)
  return value
}

const region = process.env['HOLD_AWS_REGION'] ?? 'us-east-1'
const credentials = { clientId: setting('PAYPAL_SANDBOX_CLIENT_ID'), clientSecret: setting('PAYPAL_SANDBOX_CLIENT_SECRET') }
const checked = await createPayPalClient({ environment: 'sandbox', credentials: () => Promise.resolve(credentials) }).checkCredentials()
if (!checked.ok) throw new Error(`PayPal's sandbox did not accept the credentials (${checked.error.kind}). Nothing was stored.`)
const reference = await createSecretsManagerCredentialStore(region).save(DEMO_CREDENTIAL_OWNER, 'sandbox', credentials)
console.log(`The demo's PayPal sandbox connection is stored as ${reference}. Every demo started from now on uses it.`)
