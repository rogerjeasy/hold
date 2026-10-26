import { z } from 'zod'

// What the web app needs from its environment, checked once at start-up. Locally it comes from apps/web/.env.local,
// deployed from App Runner's settings. No secret has a default, and none is a setting when deployed: the cookie key
// is named by its Secrets Manager ARN and read at start-up.

const KEY_BYTES = 32

const cookieKey = z
  .string()
  .transform((text) => Buffer.from(text, 'base64'))
  .refine((key) => key.length === KEY_BYTES, `Use ${String(KEY_BYTES)} random bytes, base64-encoded: openssl rand -base64 32`)

// Where a key comes from: the key itself, allowed only on a developer's machine, or the secret holding it.
export type KeySource = { readonly kind: 'value'; readonly key: Buffer } | { readonly kind: 'secret'; readonly secretArn: string }

// The key Clean Record credentials are signed with: an asymmetric key in AWS KMS, named by its ID or alias, or, on a
// developer's machine and in tests, a key made in the process at start.
export type CredentialKeySource = { readonly kind: 'kms'; readonly keyId: string } | { readonly kind: 'local' }

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
    // Renter links are signed with a key of their own, which the worker also reads to send links by email. On a
    // developer's machine it may be given as is, or fall back to the cookie key.
    HOLD_RENTER_LINK_KEY: cookieKey.optional(),
    HOLD_RENTER_LINK_KEY_SECRET_ARN: z.string().startsWith('arn:aws:secretsmanager:').optional(),
    // The renter key, a keyed hash of the PayPal payer ID (extensions.md section 7.4), is made with a secret of its own.
    // On a developer's machine it may be given as is, or fall back to the cookie key.
    HOLD_TRUST_KEY: cookieKey.optional(),
    HOLD_TRUST_KEY_SECRET_ARN: z.string().startsWith('arn:aws:secretsmanager:').optional(),
    // The KMS key, by ID, ARN or alias, that signs Clean Record credentials. Without it, on a developer's machine, a key
    // made at start signs them.
    HOLD_CREDENTIAL_KEY_ID: z.string().min(1).max(300).optional(),
    // The address links in Hold's emails point to.
    HOLD_PUBLIC_URL: z.url().default('http://localhost:3210'),
    // The Secrets Manager secret holding the SMTP account Hold's own emails go through, by name or ARN.
    HOLD_SMTP_SECRET: z.string().min(1),
    // Only sandbox accounts are connected in the hackathon build.
    HOLD_PAYPAL_MODE: z.literal('sandbox').default('sandbox'),
    // The worker's queues, for work the app hands on at once. Without them, work waits in the outbox for the relay.
    HOLD_EXECUTIONS_QUEUE_URL: z.url().optional(),
    HOLD_PAYPAL_EVENTS_QUEUE_URL: z.url().optional(),
    // Photographs whose display copies the worker makes. Without it, they wait in the outbox for the relay.
    HOLD_MEDIA_QUEUE_URL: z.url().optional(),
    HOLD_COMPARISONS_QUEUE_URL: z.url().optional(),
    HOLD_EVIDENCE_QUEUE_URL: z.url().optional(),
    // Where photographs go: the locked originals, and the face-blurred copies people see. Without them, on a
    // developer's machine, no photograph can be taken.
    HOLD_EVIDENCE_BUCKET: z.string().min(3).optional(),
    HOLD_DISPLAY_BUCKET: z.string().min(3).optional(),
  })
  .refine((value) => value.HOLD_ENVIRONMENT !== 'production' || value.HOLD_EXECUTIONS_QUEUE_URL !== undefined, {
    path: ['HOLD_EXECUTIONS_QUEUE_URL'],
    message: 'Deployed, the app sends executions to the worker.',
  })
  .refine((value) => value.HOLD_ENVIRONMENT !== 'production' || value.HOLD_PAYPAL_EVENTS_QUEUE_URL !== undefined, {
    path: ['HOLD_PAYPAL_EVENTS_QUEUE_URL'],
    message: 'Deployed, the app sends PayPal events to the worker.',
  })
  .refine((value) => value.HOLD_ENVIRONMENT !== 'production' || (value.HOLD_EVIDENCE_BUCKET !== undefined && value.HOLD_DISPLAY_BUCKET !== undefined), {
    path: ['HOLD_EVIDENCE_BUCKET'],
    message: 'Deployed, the app stores photographs.',
  })
  .refine((value) => value.HOLD_COOKIE_KEY_SECRET_ARN !== undefined || value.HOLD_COOKIE_KEY !== undefined, {
    path: ['HOLD_COOKIE_KEY_SECRET_ARN'],
    message: 'Name the cookie key secret.',
  })
  .refine((value) => value.HOLD_ENVIRONMENT === 'development' || value.HOLD_COOKIE_KEY === undefined, {
    path: ['HOLD_COOKIE_KEY'],
    message: 'Deployed, the cookie key comes from Secrets Manager only.',
  })
  .refine((value) => value.HOLD_ENVIRONMENT === 'development' || value.HOLD_RENTER_LINK_KEY_SECRET_ARN !== undefined, {
    path: ['HOLD_RENTER_LINK_KEY_SECRET_ARN'],
    message: 'Deployed, renter links are signed with their own key, from Secrets Manager.',
  })
  .refine((value) => value.HOLD_ENVIRONMENT === 'development' || value.HOLD_RENTER_LINK_KEY === undefined, {
    path: ['HOLD_RENTER_LINK_KEY'],
    message: 'Deployed, the renter link key comes from Secrets Manager only.',
  })
  .refine((value) => value.HOLD_ENVIRONMENT === 'development' || value.HOLD_TRUST_KEY_SECRET_ARN !== undefined, {
    path: ['HOLD_TRUST_KEY_SECRET_ARN'],
    message: 'Deployed, renter keys are made with their own secret, from Secrets Manager.',
  })
  .refine((value) => value.HOLD_ENVIRONMENT === 'development' || value.HOLD_CREDENTIAL_KEY_ID !== undefined, {
    path: ['HOLD_CREDENTIAL_KEY_ID'],
    message: 'Deployed, credentials are signed with the key in KMS.',
  })
  .refine((value) => value.HOLD_ENVIRONMENT === 'development' || value.HOLD_TRUST_KEY === undefined, {
    path: ['HOLD_TRUST_KEY'],
    message: 'Deployed, the renter key secret comes from Secrets Manager only.',
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
      readonly cookieKey: KeySource
      readonly renterLinkKey: KeySource
      readonly trustKey: KeySource
      readonly credentialKey: CredentialKeySource
      readonly publicUrl: string
      readonly smtpSecret: string
      readonly paypalMode: 'sandbox'
      // By queue name, as the outbox names them.
      readonly queues: Readonly<Record<'executions' | 'paypal-events', string> & Partial<Record<'media' | 'comparisons' | 'evidence', string>>> | undefined
      readonly photoBuckets: { readonly evidence: string; readonly display: string } | undefined
    }
  | {
      readonly environment: 'test'
      readonly services: 'fake'
      readonly cookieKey: KeySource
      readonly renterLinkKey: KeySource
      readonly trustKey: KeySource
      readonly credentialKey: CredentialKeySource
      readonly publicUrl: string
      readonly paypalMode: 'sandbox'
    }

export function loadWebConfig(environment: Readonly<Record<string, string | undefined>>): WebConfig {
  if (environment['HOLD_ENVIRONMENT'] === 'test') {
    const parsed = fakeServices.parse(environment)
    const key = { kind: 'value', key: parsed.HOLD_COOKIE_KEY } as const
    return { environment: 'test', services: 'fake', cookieKey: key, renterLinkKey: key, trustKey: key, credentialKey: { kind: 'local' }, publicUrl: parsed.HOLD_PUBLIC_URL, paypalMode: 'sandbox' }
  }
  const parsed = awsServices.safeParse(environment)
  if (!parsed.success) {
    // Names the settings that are wrong, never their values.
    const settings = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ')
    throw new Error(`The web app's settings are missing or wrong: ${settings}. See apps/web/.env.example.`)
  }
  const value = parsed.data
  const cookieKeySource: KeySource =
    value.HOLD_COOKIE_KEY_SECRET_ARN !== undefined ? { kind: 'secret', secretArn: value.HOLD_COOKIE_KEY_SECRET_ARN } : { kind: 'value', key: value.HOLD_COOKIE_KEY ?? Buffer.alloc(0) }
  return {
    environment: value.HOLD_ENVIRONMENT,
    services: 'aws',
    region: value.HOLD_AWS_REGION,
    cognito: { userPoolId: value.HOLD_COGNITO_USER_POOL_ID, clientId: value.HOLD_COGNITO_CLIENT_ID },
    database: { clusterArn: value.HOLD_DATABASE_CLUSTER_ARN, secretArn: value.HOLD_DATABASE_SECRET_ARN, name: value.HOLD_DATABASE_NAME },
    cookieKey: cookieKeySource,
    renterLinkKey:
      value.HOLD_RENTER_LINK_KEY_SECRET_ARN !== undefined
        ? { kind: 'secret', secretArn: value.HOLD_RENTER_LINK_KEY_SECRET_ARN }
        : value.HOLD_RENTER_LINK_KEY !== undefined
          ? { kind: 'value', key: value.HOLD_RENTER_LINK_KEY }
          : cookieKeySource,
    trustKey:
      value.HOLD_TRUST_KEY_SECRET_ARN !== undefined
        ? { kind: 'secret', secretArn: value.HOLD_TRUST_KEY_SECRET_ARN }
        : value.HOLD_TRUST_KEY !== undefined
          ? { kind: 'value', key: value.HOLD_TRUST_KEY }
          : cookieKeySource,
    credentialKey: value.HOLD_CREDENTIAL_KEY_ID === undefined ? { kind: 'local' } : { kind: 'kms', keyId: value.HOLD_CREDENTIAL_KEY_ID },
    publicUrl: value.HOLD_PUBLIC_URL.replace(/\/$/, ''),
    smtpSecret: value.HOLD_SMTP_SECRET,
    paypalMode: value.HOLD_PAYPAL_MODE,
    queues:
      value.HOLD_EXECUTIONS_QUEUE_URL === undefined || value.HOLD_PAYPAL_EVENTS_QUEUE_URL === undefined
        ? undefined
        : {
            executions: value.HOLD_EXECUTIONS_QUEUE_URL,
            'paypal-events': value.HOLD_PAYPAL_EVENTS_QUEUE_URL,
            ...(value.HOLD_MEDIA_QUEUE_URL === undefined ? {} : { media: value.HOLD_MEDIA_QUEUE_URL }),
            ...(value.HOLD_COMPARISONS_QUEUE_URL === undefined ? {} : { comparisons: value.HOLD_COMPARISONS_QUEUE_URL }),
            ...(value.HOLD_EVIDENCE_QUEUE_URL === undefined ? {} : { evidence: value.HOLD_EVIDENCE_QUEUE_URL }),
          },
    photoBuckets: value.HOLD_EVIDENCE_BUCKET === undefined || value.HOLD_DISPLAY_BUCKET === undefined ? undefined : { evidence: value.HOLD_EVIDENCE_BUCKET, display: value.HOLD_DISPLAY_BUCKET },
  }
}
