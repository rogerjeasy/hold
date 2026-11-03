import { comparisonMessageSchema, createBedrockComparisonModel, runComparison } from '@hold/compare'
import { createDataApiDatabase } from '@hold/db/data-api'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createS3EvidenceStore, withSampleDisplays } from '@hold/evidence/photos'
import { z } from 'zod'
import { withReviewPush } from './comparison-push.ts'
import { createStaffPush, workerPushSender } from './push.ts'
import { createQueueHandler } from './queue-batch.ts'

// This function has a separate role: no PayPal secret, money queue, or write access to photograph storage.
const settings = z.object({ AWS_REGION: z.string().min(1), HOLD_DATABASE_CLUSTER_ARN: z.string().startsWith('arn:aws:rds:'), HOLD_DATABASE_SECRET_ARN: z.string().startsWith('arn:aws:secretsmanager:'), HOLD_DATABASE_NAME: z.string().min(1), HOLD_EVIDENCE_BUCKET: z.string().min(3), HOLD_DISPLAY_BUCKET: z.string().min(3) }).safeParse(process.env)
if (!settings.success) throw new Error(`Comparison settings missing or wrong: ${settings.error.issues.map((issue) => issue.path.join('.')).join(', ')}.`)
const value = settings.data
const dependencies = {
  database: createDataApiDatabase({ region: value.AWS_REGION, clusterArn: value.HOLD_DATABASE_CLUSTER_ARN, secretArn: value.HOLD_DATABASE_SECRET_ARN, database: value.HOLD_DATABASE_NAME }),
  role: 'hold_worker' as const,
  // A sample return's photographs are the demonstration's own, installed beside the code in samples/ (infra/lib/worker.ts).
  evidence: withSampleDisplays(createS3EvidenceStore({ evidenceBucket: value.HOLD_EVIDENCE_BUCKET, displayBucket: value.HOLD_DISPLAY_BUCKET, region: value.AWS_REGION }), (file) => readFile(join(process.env['LAMBDA_TASK_ROOT'] ?? '.', 'samples', file))),
  model: createBedrockComparisonModel({ awsRegion: value.AWS_REGION }),
  now: () => new Date(),
}
const staffPush = createStaffPush({ database: dependencies.database, push: workerPushSender(process.env) })
export const handler = createQueueHandler({ schema: comparisonMessageSchema, handle: withReviewPush((message) => runComparison(dependencies, message), staffPush) })
