import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

const execute = promisify(execFile)
const workerRoot = join(import.meta.dirname, '..')
const workerRequire = createRequire(join(workerRoot, 'package.json'))
const environment = {
  AWS_REGION: 'us-east-1',
  HOLD_DATABASE_CLUSTER_ARN: 'arn:aws:rds:us-east-1:1:cluster:hold-database',
  HOLD_DATABASE_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:1:secret:hold/database/worker',
  HOLD_DATABASE_NAME: 'hold_db',
  HOLD_EXECUTIONS_QUEUE_URL: 'https://sqs.example/executions.fifo',
  HOLD_PAYPAL_EVENTS_QUEUE_URL: 'https://sqs.example/paypal-events.fifo',
  HOLD_UPKEEP_QUEUE_URL: 'https://sqs.example/upkeep.fifo',
  HOLD_UPKEEP_QUEUE_ARN: 'arn:aws:sqs:us-east-1:1:hold-upkeep.fifo',
  HOLD_SCHEDULE_GROUP: 'hold-schedules',
  HOLD_SCHEDULER_ROLE_ARN: 'arn:aws:iam::1:role/hold-scheduler',
  HOLD_SMTP_SECRET: 'hold/email/smtp',
  HOLD_PUBLIC_URL: 'https://hold.example',
  HOLD_RENTER_LINK_KEY_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:1:secret:hold/web/renter-link-key',
  HOLD_EVIDENCE_BUCKET: 'hold-evidence-1',
  HOLD_DISPLAY_BUCKET: 'hold-display-1',
}

describe('photo worker deployment bundles', () => {
  it.each(['media-lambda.ts', 'comparisons-lambda.ts'])('%s handles an empty SQS batch after CommonJS bundling', async (entry) => {
    const directory = await mkdtemp(join(tmpdir(), 'hold-worker-startup-'))
    const bundle = join(directory, 'index.cjs')
    try {
      await build({ entryPoints: [join(import.meta.dirname, entry)], outfile: bundle, bundle: true, platform: 'node', target: 'node24', format: 'cjs', minify: true, external: ['sharp', '@techstark/opencv-js'], logLevel: 'silent' })
      // Use installed native modules, as Lambda does; the rest runs from the actual deployment-format bundle.
      const modulePaths = workerRequire.resolve.paths('sharp') ?? []
      const result = await execute(process.execPath, ['-e', `require(${JSON.stringify(bundle)}).handler({ Records: [] }).then(result => process.stdout.write(JSON.stringify(result)))`], {
        env: { ...process.env, ...environment, NODE_PATH: modulePaths.join(delimiter) }, timeout: 15_000,
      })
      expect(JSON.parse(result.stdout)).toEqual({ batchItemFailures: [] })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 30_000)
})
