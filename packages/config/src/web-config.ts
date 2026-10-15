import { z } from 'zod'

// What the web app needs from its environment, checked once at start-up. Locally it comes from apps/web/.env.local,
// deployed from App Runner's settings. No secret has a default, and none is a setting when deployed: the cookie key
// is named by its Secrets Manager ARN and read at start-up.

const KEY_BYTES = 32

const cookieKey = z
  .string()
  .transform((text) => Buffer.from(text, 'base64'))
  .refine((key) => key.length === KEY_BYTES, `Use ${String(KEY_BYTES)} random bytes, base64-encoded: openssl rand -base64 32`)

// Where the cookie key comes from: the key itself, allowed only on a developer's machine, or the secret holding it.
export type CookieKeySource = { readonly kind: 'value'; readonly key: Buffer } | { readonly kind: 'secret'; readonly secretArn: string }

const awsServices = z
  .object({
    HOLD_ENVIRONMENT: z.enum(['development', 'production']).default('development'),
    HOLD_AWS_REGION: z.string().min(1).default('us-east-1'),
    HOLD_COGNITO_USER_POOL_ID: z.string().regex(/^[\w-]+_[0-9a-zA-Z]+$/),
    HOLD_COGNITO_CLIENT_ID: z.string().min(1),
    HOLD_DATABASE_CLUSTER_ARN: z.string().startsWith('arn:aws:rds:'),
    HOLD_DATABASE_SECRET_ARN: z.string().startsWith('arn:aws:secretsmanager:'),
    HOLD_DATABASE_NAME: z.string().min(1).default('hold_db'),
    HOLD_COOKIE_KEY: cookieKey.optional(),
    HOLD_COOKIE_KEY_SECRET_ARN: z.string().startsWith('arn:aws:secretsmanager:').optional(),
    // The address links in Hold's emails point to.
    HOLD_PUBLIC_URL: z.url().default('http://localhost:3210'),
    // The Secrets Manager secret holding the SMTP account Hold's own emails go through, by name or ARN.
    HOLD_SMTP_SECRET: z.string().min(1),
    // Only sandbox accounts are connected in the hackathon build.
    HOLD_PAYPAL_MODE: z.literal('sandbox').default('sandbox'),
  })
  .refine((value) => value.HOLD_COOKIE_KEY_SECRET_ARN !== undefined || value.HOLD_COOKIE_KEY !== undefined, {
    path: ['HOLD_COOKIE_KEY_SECRET_ARN'],
    message: 'Name the cookie key secret.',
  })
  .refine((value) => value.HOLD_ENVIRONMENT === 'development' || value.HOLD_COOKIE_KEY === undefined, {
    path: ['HOLD_COOKIE_KEY'],
    message: 'Deployed, the cookie key comes from Secrets Manager only.',
  })

// The automated tests run the built app against in-process fakes: an identity service whose code is fixed, a
// database in memory, and a mailer and credential store that keep what they are given. Only this environment uses
// them, so a deployment can never fall back to a fake.
const fakeServices = z.object({
  HOLD_ENVIRONMENT: z.literal('test'),
  HOLD_COOKIE_KEY: cookieKey,
  HOLD_PUBLIC_URL: z.url().default('http://localhost:3211'),
})

export type WebConfig =
  | {
      readonly environment: 'development' | 'production'
      readonly services: 'aws'
      readonly region: string
      readonly cognito: { readonly userPoolId: string; readonly clientId: string }
      readonly database: { readonly clusterArn: string; readonly secretArn: string; readonly name: string }
      readonly cookieKey: CookieKeySource
      readonly publicUrl: string
      readonly smtpSecret: string
      readonly paypalMode: 'sandbox'
    }
  | {
      readonly environment: 'test'
      readonly services: 'fake'
      readonly cookieKey: CookieKeySource
      readonly publicUrl: string
      readonly paypalMode: 'sandbox'
    }

export function loadWebConfig(environment: Readonly<Record<string, string | undefined>>): WebConfig {
  if (environment['HOLD_ENVIRONMENT'] === 'test') {
    const parsed = fakeServices.parse(environment)
    return { environment: 'test', services: 'fake', cookieKey: { kind: 'value', key: parsed.HOLD_COOKIE_KEY }, publicUrl: parsed.HOLD_PUBLIC_URL, paypalMode: 'sandbox' }
  }
  const parsed = awsServices.safeParse(environment)
  if (!parsed.success) {
    // Names the settings that are wrong, never their values.
    const settings = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ')
    throw new Error(`The web app's settings are missing or wrong: ${settings}. See apps/web/.env.example.`)
  }
  const value = parsed.data
  return {
    environment: value.HOLD_ENVIRONMENT,
    services: 'aws',
    region: value.HOLD_AWS_REGION,
    cognito: { userPoolId: value.HOLD_COGNITO_USER_POOL_ID, clientId: value.HOLD_COGNITO_CLIENT_ID },
    database: { clusterArn: value.HOLD_DATABASE_CLUSTER_ARN, secretArn: value.HOLD_DATABASE_SECRET_ARN, name: value.HOLD_DATABASE_NAME },
    cookieKey:
      value.HOLD_COOKIE_KEY_SECRET_ARN !== undefined
        ? { kind: 'secret', secretArn: value.HOLD_COOKIE_KEY_SECRET_ARN }
        : { kind: 'value', key: value.HOLD_COOKIE_KEY ?? Buffer.alloc(0) },
    publicUrl: value.HOLD_PUBLIC_URL.replace(/\/$/, ''),
    smtpSecret: value.HOLD_SMTP_SECRET,
    paypalMode: value.HOLD_PAYPAL_MODE,
  }
}
