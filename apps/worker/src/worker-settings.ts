import { z } from 'zod'

// What the worker's functions need from their environment, set by infra/lib/worker.ts. No secret is a setting: the
// database login is named by its secret's ARN.
const schema = z.object({
  AWS_REGION: z.string().min(1),
  HOLD_DATABASE_CLUSTER_ARN: z.string().startsWith('arn:aws:rds:'),
  HOLD_DATABASE_SECRET_ARN: z.string().startsWith('arn:aws:secretsmanager:'),
  HOLD_DATABASE_NAME: z.string().min(1).default('hold_db'),
  HOLD_EXECUTIONS_QUEUE_URL: z.url(),
  HOLD_PAYPAL_EVENTS_QUEUE_URL: z.url(),
  HOLD_PAYPAL_MODE: z.literal('sandbox').default('sandbox'),
})

export type WorkerSettings = {
  readonly region: string
  readonly database: { readonly clusterArn: string; readonly secretArn: string; readonly name: string }
  readonly queues: Readonly<Record<'executions' | 'paypal-events', string>>
  readonly paypalMode: 'sandbox'
}

export function loadWorkerSettings(environment: Readonly<Record<string, string | undefined>>): WorkerSettings {
  const parsed = schema.safeParse(environment)
  if (!parsed.success) throw new Error(`The worker's settings are missing or wrong: ${[...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ')}.`)
  const value = parsed.data
  return {
    region: value.AWS_REGION,
    database: { clusterArn: value.HOLD_DATABASE_CLUSTER_ARN, secretArn: value.HOLD_DATABASE_SECRET_ARN, name: value.HOLD_DATABASE_NAME },
    queues: { executions: value.HOLD_EXECUTIONS_QUEUE_URL, 'paypal-events': value.HOLD_PAYPAL_EVENTS_QUEUE_URL },
    paypalMode: value.HOLD_PAYPAL_MODE,
  }
}
