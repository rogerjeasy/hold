import { comparisonMessageSchema, createBedrockComparisonModel, runComparison } from '@hold/compare'
import { createDataApiDatabase } from '@hold/db/data-api'
import { createS3EvidenceStore } from '@hold/evidence'
import { z } from 'zod'
import { createQueueHandler } from './queue-batch.ts'

// This function has a separate role: no PayPal secret, money queue, or write access to photograph storage.
const settings = z.object({ AWS_REGION: z.string().min(1), HOLD_DATABASE_CLUSTER_ARN: z.string().startsWith('arn:aws:rds:'), HOLD_DATABASE_SECRET_ARN: z.string().startsWith('arn:aws:secretsmanager:'), HOLD_DATABASE_NAME: z.string().min(1), HOLD_EVIDENCE_BUCKET: z.string().min(3), HOLD_DISPLAY_BUCKET: z.string().min(3) }).safeParse(process.env)
if (!settings.success) throw new Error(`Comparison settings missing or wrong: ${settings.error.issues.map((issue) => issue.path.join('.')).join(', ')}.`)
const value = settings.data
const dependencies = {
  database: createDataApiDatabase({ region: value.AWS_REGION, clusterArn: value.HOLD_DATABASE_CLUSTER_ARN, secretArn: value.HOLD_DATABASE_SECRET_ARN, database: value.HOLD_DATABASE_NAME }),
  role: 'hold_worker' as const,
  evidence: createS3EvidenceStore({ evidenceBucket: value.HOLD_EVIDENCE_BUCKET, displayBucket: value.HOLD_DISPLAY_BUCKET, region: value.AWS_REGION }),
  model: createBedrockComparisonModel({ awsRegion: value.AWS_REGION }),
  now: () => new Date(),
}
export const handler = createQueueHandler({ schema: comparisonMessageSchema, handle: (message) => runComparison(dependencies, message) })
