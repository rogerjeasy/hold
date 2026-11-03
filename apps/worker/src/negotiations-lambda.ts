import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createDataApiDatabase } from '@hold/db/data-api'
import { createBedrockAdvocateModel, negotiationMessageSchema, runNegotiation } from '@hold/negotiate'
import { z } from 'zod'
import { displayPhotoReader } from './display-photos.ts'
import { createQueueHandler } from './queue-batch.ts'

// This function has a role of its own: the database, Claude on Bedrock, and the display copies of photographs, read
// only. No PayPal secret, no money queue and no original photograph. Each side's advocate is a separate client, so
// their requests never share a context.
const settings = z.object({ AWS_REGION: z.string().min(1), HOLD_DATABASE_CLUSTER_ARN: z.string().startsWith('arn:aws:rds:'), HOLD_DATABASE_SECRET_ARN: z.string().startsWith('arn:aws:secretsmanager:'), HOLD_DATABASE_NAME: z.string().min(1), HOLD_DISPLAY_BUCKET: z.string().min(3) }).safeParse(process.env)
if (!settings.success) throw new Error(`Negotiation settings missing or wrong: ${settings.error.issues.map((issue) => issue.path.join('.')).join(', ')}.`)
const value = settings.data
const dependencies = {
  database: createDataApiDatabase({ region: value.AWS_REGION, clusterArn: value.HOLD_DATABASE_CLUSTER_ARN, secretArn: value.HOLD_DATABASE_SECRET_ARN, database: value.HOLD_DATABASE_NAME }),
  role: 'hold_worker' as const,
  models: { shop: createBedrockAdvocateModel({ awsRegion: value.AWS_REGION }), renter: createBedrockAdvocateModel({ awsRegion: value.AWS_REGION }) },
  // The sample rentals' photographs are installed beside the code, in samples/ (infra/lib/worker.ts).
  photos: displayPhotoReader({ region: value.AWS_REGION, bucket: value.HOLD_DISPLAY_BUCKET, readSample: (file) => readFile(join(process.env['LAMBDA_TASK_ROOT'] ?? '.', 'samples', file)) }),
  now: () => new Date(),
}
export const handler = createQueueHandler({ schema: negotiationMessageSchema, handle: (message) => runNegotiation(dependencies, message) })
