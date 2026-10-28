import { shopsForOperations } from '@hold/db'
import { createDataApiDatabase } from '@hold/db/data-api'
import { endStaleNegotiations } from '@hold/negotiate'
import { z } from 'zod'

// Run every five minutes by EventBridge Scheduler (infra/lib/negotiation-worker.ts): in each shop with a PayPal
// account, every open negotiation whose time is up with nobody moving goes to the owner. Nothing is captured.
const settings = z.object({ AWS_REGION: z.string().min(1), HOLD_DATABASE_CLUSTER_ARN: z.string().startsWith('arn:aws:rds:'), HOLD_DATABASE_SECRET_ARN: z.string().startsWith('arn:aws:secretsmanager:'), HOLD_DATABASE_NAME: z.string().min(1), HOLD_PAYPAL_MODE: z.literal('sandbox').default('sandbox') }).safeParse(process.env)
if (!settings.success) throw new Error(`Negotiation sweep settings missing or wrong: ${settings.error.issues.map((issue) => issue.path.join('.')).join(', ')}.`)
const value = settings.data
const dependencies = { database: createDataApiDatabase({ region: value.AWS_REGION, clusterArn: value.HOLD_DATABASE_CLUSTER_ARN, secretArn: value.HOLD_DATABASE_SECRET_ARN, database: value.HOLD_DATABASE_NAME }), role: 'hold_worker' as const, now: () => new Date() }

export async function handler(): Promise<{ readonly ended: number }> {
  let ended = 0
  for (const shopId of await shopsForOperations(dependencies.database, value.HOLD_PAYPAL_MODE)) ended += await endStaleNegotiations(dependencies, shopId)
  return { ended }
}
