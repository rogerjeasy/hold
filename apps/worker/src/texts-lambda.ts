import { createDataApiDatabase } from '@hold/db/data-api'
import { z } from 'zod'
import { createQueueHandler } from './queue-batch.ts'
import { recordTextReport, textReportSchema } from './text-report.ts'

// Delivery reports for renters' texts, from AWS End User Messaging through SNS to this queue (infra/lib/texts.ts).
const settings = z.object({
  AWS_REGION: z.string().min(1),
  HOLD_DATABASE_CLUSTER_ARN: z.string().startsWith('arn:aws:rds:'),
  HOLD_DATABASE_SECRET_ARN: z.string().startsWith('arn:aws:secretsmanager:'),
  HOLD_DATABASE_NAME: z.string().min(1).default('hold_db'),
}).parse(process.env)
const database = createDataApiDatabase({ region: settings.AWS_REGION, clusterArn: settings.HOLD_DATABASE_CLUSTER_ARN, secretArn: settings.HOLD_DATABASE_SECRET_ARN, database: settings.HOLD_DATABASE_NAME })

export const handler = createQueueHandler({ schema: textReportSchema, handle: (report) => recordTextReport(database, report) })
