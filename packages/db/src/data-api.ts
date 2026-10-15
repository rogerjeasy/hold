import { RDSDataClient } from '@aws-sdk/client-rds-data'
import { drizzle } from 'drizzle-orm/aws-data-api/pg'
import * as schema from './schema/index.ts'

export type DataApiSettings = {
  readonly region: string
  readonly clusterArn: string
  // The secret of the login to use: hold_app for the services, hold_admin for migrations.
  readonly secretArn: string
  readonly database: string
}

// Aurora pauses at zero capacity. While it resumes, every call fails with this, usually for under a minute, but a
// deploy has seen it last longer than one. Three minutes of trying covers it.
const RESUMING = 'DatabaseResumingException'
const RESUME_ATTEMPTS = 60
const RESUME_WAIT_MILLISECONDS = 3_000

function isResuming(error: unknown): boolean {
  return error instanceof Error && error.name === RESUMING
}

// Deployed, the services reach Aurora through the RDS Data API: SQL over HTTPS, signed with IAM (decision 28).
// Returned as the driver's own type, which migrations need. Repositories take it as a Database. The client is passed
// in only by tests.
export function createDataApiDatabase(settings: DataApiSettings, client = new RDSDataClient({ region: settings.region })) {
  // The call fails before any statement runs, so trying it again cannot run a statement twice.
  client.middlewareStack.add(
    (next) => async (args) => {
      for (let attempt = 1; ; attempt += 1) {
        try {
          return await next(args)
        } catch (error) {
          if (!isResuming(error) || attempt === RESUME_ATTEMPTS) throw error
          await new Promise((resolve) => setTimeout(resolve, RESUME_WAIT_MILLISECONDS))
        }
      }
    },
    { step: 'initialize', name: 'retryWhileDatabaseResumes' },
  )
  return drizzle(client, { database: settings.database, resourceArn: settings.clusterArn, secretArn: settings.secretArn, schema, casing: 'snake_case' })
}

