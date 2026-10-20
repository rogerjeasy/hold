import { createDataApiDatabase } from '@hold/db/data-api'
import { createS3DocumentStore, createS3EvidenceStore } from '@hold/evidence'
import type { EvidencePackDependencies } from '@hold/evidence'
import { z } from 'zod'

const schema = z.object({
  AWS_REGION: z.string().min(1),
  HOLD_DATABASE_CLUSTER_ARN: z.string().startsWith('arn:aws:rds:'),
  HOLD_DATABASE_SECRET_ARN: z.string().startsWith('arn:aws:secretsmanager:'),
  HOLD_DATABASE_NAME: z.string().min(1),
  HOLD_EVIDENCE_BUCKET: z.string().min(3),
  HOLD_DISPLAY_BUCKET: z.string().min(3),
})

// Documents need the worker database login and the two buckets, with no payment or link-signing credentials.
export function workerEvidence(): EvidencePackDependencies {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) throw new Error(`Evidence settings missing or wrong: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}.`)
  const settings = parsed.data
  return {
    database: createDataApiDatabase({ region: settings.AWS_REGION, clusterArn: settings.HOLD_DATABASE_CLUSTER_ARN, secretArn: settings.HOLD_DATABASE_SECRET_ARN, database: settings.HOLD_DATABASE_NAME }),
    role: 'hold_worker',
    evidence: createS3EvidenceStore({ region: settings.AWS_REGION, evidenceBucket: settings.HOLD_EVIDENCE_BUCKET, displayBucket: settings.HOLD_DISPLAY_BUCKET }),
    documents: createS3DocumentStore({ region: settings.AWS_REGION, evidenceBucket: settings.HOLD_EVIDENCE_BUCKET }),
  }
}
