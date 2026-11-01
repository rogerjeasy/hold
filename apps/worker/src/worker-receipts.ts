import { readKeySecret } from '@hold/auth'
import { createDataApiDatabase } from '@hold/db/data-api'
import { createLazyMailer, createSmtpMailer, loadSmtpSettings } from '@hold/notify'
import { z } from 'zod'
import type { sendSettlementReceipt } from './settlement-receipt.ts'
import { workerTexter } from './worker-texter.ts'

const schema = z.object({
  AWS_REGION: z.string().min(1),
  HOLD_DATABASE_CLUSTER_ARN: z.string().startsWith('arn:aws:rds:'),
  HOLD_DATABASE_SECRET_ARN: z.string().startsWith('arn:aws:secretsmanager:'),
  HOLD_DATABASE_NAME: z.string().min(1),
  HOLD_SMTP_SECRET: z.string().min(1),
  HOLD_PUBLIC_URL: z.url(),
  HOLD_RENTER_LINK_KEY_SECRET_ARN: z.string().startsWith('arn:aws:secretsmanager:'),
})

export function workerReceipts(): Parameters<typeof sendSettlementReceipt>[0] {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) throw new Error(`Receipt settings missing or wrong: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}.`)
  const settings = parsed.data
  let linkKey: Promise<Buffer> | undefined
  return {
    database: createDataApiDatabase({ region: settings.AWS_REGION, clusterArn: settings.HOLD_DATABASE_CLUSTER_ARN, secretArn: settings.HOLD_DATABASE_SECRET_ARN, database: settings.HOLD_DATABASE_NAME }),
    mailer: createLazyMailer(async () => createSmtpMailer(await loadSmtpSettings(settings.HOLD_SMTP_SECRET, settings.AWS_REGION))),
    texter: workerTexter(process.env),
    publicUrl: settings.HOLD_PUBLIC_URL.replace(/\/$/, ''),
    linkKey: () => (linkKey ??= readKeySecret(settings.HOLD_RENTER_LINK_KEY_SECRET_ARN, settings.AWS_REGION)),
    now: () => new Date(),
  }
}
