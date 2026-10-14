import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/aws-data-api/pg/migrator'
import { createDataApiDatabase } from '../src/data-api.ts'
import { scramVerifier } from '../src/scram.ts'

// Applies every migration to Hold's Aurora cluster as the owner, hold_admin, then gives hold_app its login with the
// password Secrets Manager holds for it. Safe to run again: applied migrations are skipped and the password is reset
// to the same one. Run with AWS credentials for the account, for example AWS_PROFILE=wick-dev.

function setting(name: 'HOLD_DATABASE_CLUSTER_ARN' | 'HOLD_DATABASE_ADMIN_SECRET_ARN' | 'HOLD_DATABASE_APP_SECRET_ARN'): string {
  const value = process.env[name]
  if (value === undefined || value === '') throw new Error(`${name} is not set.`)
  return value
}

const region = process.env['HOLD_AWS_REGION'] ?? 'us-east-1'
const database = process.env['HOLD_DATABASE_NAME'] ?? 'hold_db'
const MIGRATIONS = new URL('../migrations', import.meta.url).pathname
// A verifier holds only these characters, so it can be written into the statement, which takes no parameter here.
const VERIFIER_SHAPE = /^SCRAM-SHA-256\$\d+:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/

const admin = createDataApiDatabase({ region, clusterArn: setting('HOLD_DATABASE_CLUSTER_ARN'), secretArn: setting('HOLD_DATABASE_ADMIN_SECRET_ARN'), database })
console.log(`Migrating ${database}...`)
await migrate(admin, { migrationsFolder: MIGRATIONS })

const secrets = new SecretsManagerClient({ region })
const secret = await secrets.send(new GetSecretValueCommand({ SecretId: setting('HOLD_DATABASE_APP_SECRET_ARN') }))
const { username, password } = JSON.parse(secret.SecretString ?? '{}') as { username?: unknown; password?: unknown }
if (username !== 'hold_app' || typeof password !== 'string') throw new Error('The app secret does not hold the hold_app login.')
const verifier = scramVerifier(password)
if (!VERIFIER_SHAPE.test(verifier)) throw new Error('The password verifier has an unexpected shape.')
await admin.execute(sql.raw(`ALTER ROLE hold_app WITH LOGIN PASSWORD '${verifier}'`))

const [applied] = await admin.select({ count: sql<number>`count(*)::int` }).from(sql`drizzle.__drizzle_migrations`)
console.log(`Done. ${String(applied?.count)} migrations applied. hold_app can log in.`)
