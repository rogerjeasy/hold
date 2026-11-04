import { createDemoAccountRemoval } from '@hold/auth'
import { createDataApiDatabase } from '@hold/db/data-api'
import { z } from 'zod'
import { runDailyCleanup } from './demo-cleanup.ts'

// Run once a day by EventBridge Scheduler (infra/lib/demo-cleanup.ts), with a role of its own: the database as
// hold_worker, and deleting a user in Hold's user pool, nothing else.
const settings = z
  .object({
    AWS_REGION: z.string().min(1),
    HOLD_DATABASE_CLUSTER_ARN: z.string().startsWith('arn:aws:rds:'),
    HOLD_DATABASE_SECRET_ARN: z.string().startsWith('arn:aws:secretsmanager:'),
    HOLD_DATABASE_NAME: z.string().min(1),
    HOLD_USER_POOL_ID: z.string().min(1),
  })
  .safeParse(process.env)
if (!settings.success) throw new Error(`Demo cleanup settings missing or wrong: ${settings.error.issues.map((issue) => issue.path.join('.')).join(', ')}.`)
const value = settings.data
const dependencies = {
  database: createDataApiDatabase({ region: value.AWS_REGION, clusterArn: value.HOLD_DATABASE_CLUSTER_ARN, secretArn: value.HOLD_DATABASE_SECRET_ARN, database: value.HOLD_DATABASE_NAME }),
  accounts: createDemoAccountRemoval({ region: value.AWS_REGION, userPoolId: value.HOLD_USER_POOL_ID }),
  now: () => new Date(),
}

export async function handler(): Promise<{ readonly retired: number; readonly failed: number; readonly prunedLimits: number }> {
  return runDailyCleanup(dependencies)
}
