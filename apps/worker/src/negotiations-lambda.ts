import { createDataApiDatabase } from '@hold/db/data-api'
import { createBedrockAdvocateModel, negotiationMessageSchema, runNegotiation } from '@hold/negotiate'
import { z } from 'zod'
import { createQueueHandler } from './queue-batch.ts'

// This function has a role of its own: the database and Claude on Bedrock only. No PayPal secret, no money queue and no
// photograph storage. Each side's advocate is a separate client, so their requests never share a context.
const settings = z.object({ AWS_REGION: z.string().min(1), HOLD_DATABASE_CLUSTER_ARN: z.string().startsWith('arn:aws:rds:'), HOLD_DATABASE_SECRET_ARN: z.string().startsWith('arn:aws:secretsmanager:'), HOLD_DATABASE_NAME: z.string().min(1) }).safeParse(process.env)
if (!settings.success) throw new Error(`Negotiation settings missing or wrong: ${settings.error.issues.map((issue) => issue.path.join('.')).join(', ')}.`)
const value = settings.data
const dependencies = {
  database: createDataApiDatabase({ region: value.AWS_REGION, clusterArn: value.HOLD_DATABASE_CLUSTER_ARN, secretArn: value.HOLD_DATABASE_SECRET_ARN, database: value.HOLD_DATABASE_NAME }),
  role: 'hold_worker' as const,
  models: { shop: createBedrockAdvocateModel({ awsRegion: value.AWS_REGION }), renter: createBedrockAdvocateModel({ awsRegion: value.AWS_REGION }) },
  now: () => new Date(),
}
export const handler = createQueueHandler({ schema: negotiationMessageSchema, handle: (message) => runNegotiation(dependencies, message) })
