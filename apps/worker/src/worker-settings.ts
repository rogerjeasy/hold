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
  HOLD_UPKEEP_QUEUE_URL: z.url(),
  HOLD_COMPARISONS_QUEUE_URL: z.url().optional(),
  HOLD_MEDIA_QUEUE_URL: z.url().optional(),
  HOLD_EVIDENCE_QUEUE_URL: z.url().optional(),
  HOLD_MESSAGES_QUEUE_URL: z.url().optional(),
  HOLD_UPKEEP_QUEUE_ARN: z.string().startsWith('arn:aws:sqs:'),
  HOLD_SCHEDULE_GROUP: z.string().min(1),
  HOLD_SCHEDULER_ROLE_ARN: z.string().startsWith('arn:aws:iam:'),
  HOLD_PAYPAL_MODE: z.literal('sandbox').default('sandbox'),
  // Named, not its value: the SMTP login is read from Secrets Manager when the first email is sent.
  HOLD_SMTP_SECRET: z.string().min(1),
  // The web app's own address, for links in the emails the worker sends.
  HOLD_PUBLIC_URL: z.url(),
  // The key renter links are signed with, shared with the web app. Never the web app's cookie key.
  HOLD_RENTER_LINK_KEY_SECRET_ARN: z.string().startsWith('arn:aws:secretsmanager:'),
  // The locked originals it reads, and the display copies it writes.
  HOLD_EVIDENCE_BUCKET: z.string().min(3),
  HOLD_DISPLAY_BUCKET: z.string().min(3),
})

export type WorkerSettings = {
  readonly region: string
  readonly database: { readonly clusterArn: string; readonly secretArn: string; readonly name: string }
  readonly queues: Readonly<Record<'executions' | 'paypal-events' | 'upkeep', string> & Partial<Record<'comparisons' | 'media' | 'evidence' | 'messages', string>>>
  // Where a hold's schedules are made, the role they send with, and the queues they may send to.
  readonly schedules: { readonly groupName: string; readonly roleArn: string; readonly queueArns: Readonly<Record<'upkeep', string>> }
  readonly paypalMode: 'sandbox'
  readonly smtpSecret: string
  readonly publicUrl: string
  readonly renterLinkKeySecretArn: string
  readonly photoBuckets: { readonly evidence: string; readonly display: string }
}

export function loadWorkerSettings(environment: Readonly<Record<string, string | undefined>>): WorkerSettings {
  const parsed = schema.safeParse(environment)
  if (!parsed.success) throw new Error(`The worker's settings are missing or wrong: ${[...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ')}.`)
  const value = parsed.data
  return {
    region: value.AWS_REGION,
    database: { clusterArn: value.HOLD_DATABASE_CLUSTER_ARN, secretArn: value.HOLD_DATABASE_SECRET_ARN, name: value.HOLD_DATABASE_NAME },
    queues: { executions: value.HOLD_EXECUTIONS_QUEUE_URL, 'paypal-events': value.HOLD_PAYPAL_EVENTS_QUEUE_URL, upkeep: value.HOLD_UPKEEP_QUEUE_URL, ...(value.HOLD_COMPARISONS_QUEUE_URL === undefined ? {} : { comparisons: value.HOLD_COMPARISONS_QUEUE_URL }), ...(value.HOLD_MEDIA_QUEUE_URL === undefined ? {} : { media: value.HOLD_MEDIA_QUEUE_URL }), ...(value.HOLD_EVIDENCE_QUEUE_URL === undefined ? {} : { evidence: value.HOLD_EVIDENCE_QUEUE_URL }), ...(value.HOLD_MESSAGES_QUEUE_URL === undefined ? {} : { messages: value.HOLD_MESSAGES_QUEUE_URL }) },
    schedules: { groupName: value.HOLD_SCHEDULE_GROUP, roleArn: value.HOLD_SCHEDULER_ROLE_ARN, queueArns: { upkeep: value.HOLD_UPKEEP_QUEUE_ARN } },
    paypalMode: value.HOLD_PAYPAL_MODE,
    smtpSecret: value.HOLD_SMTP_SECRET,
    publicUrl: value.HOLD_PUBLIC_URL.replace(/\/$/, ''),
    renterLinkKeySecretArn: value.HOLD_RENTER_LINK_KEY_SECRET_ARN,
    photoBuckets: { evidence: value.HOLD_EVIDENCE_BUCKET, display: value.HOLD_DISPLAY_BUCKET },
  }
}
