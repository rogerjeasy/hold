import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { createBedrockComparisonModel, PROMPT_VERSION } from '@hold/compare'
import { createDataApiDatabase } from '@hold/db/data-api'
import { perceptualHash } from '@hold/vision'
import { z } from 'zod'
import { runEvaluation } from './evaluate.ts'
import { HALVES } from './manifest.ts'
import { pipelineVersion } from './pipeline-version.ts'

// Runs one half of the evaluation set through the comparison on Bedrock.
//   pnpm eval --half gate [--accept] [--limit 10]
// Records the run in eval_runs when HOLD_DATABASE_CLUSTER_ARN and a login are set: HOLD_DATABASE_EVAL_SECRET_ARN in CI,
// or HOLD_DATABASE_ADMIN_SECRET_ARN (the owner, as for migrations) to accept a run. Exits non-zero when the gate half
// fails the gate.

const { values } = parseArgs({ options: { half: { type: 'string', default: 'tuning' }, accept: { type: 'boolean', default: false }, limit: { type: 'string' } } })
const half = z.enum(HALVES).parse(values.half)
const here = new URL('..', import.meta.url).pathname
const repository = new URL('../..', import.meta.url).pathname

const limitsSchema = z.strictObject({ maxCleanWronglyFlagged: z.number().min(0).max(1), maxDamageFoundDrop: z.number().min(0).max(1) })
const limits = await readFile(`${here}gate-limits.json`, 'utf8').then((text) => limitsSchema.parse(JSON.parse(text)), () => null)

const cluster = process.env['HOLD_DATABASE_CLUSTER_ARN']
// The evaluation login, which may only record and read runs; the owner's login locally, which may also accept one.
const owner = process.env['HOLD_DATABASE_EVAL_SECRET_ARN'] ?? process.env['HOLD_DATABASE_ADMIN_SECRET_ARN']
const region = process.env['AWS_REGION'] ?? process.env['HOLD_AWS_REGION'] ?? 'us-east-1'
const database = cluster !== undefined && owner !== undefined && cluster !== '' && owner !== '' ? createDataApiDatabase({ region, clusterArn: cluster, secretArn: owner, database: process.env['HOLD_DATABASE_NAME'] ?? 'hold_db' }) : undefined
if (database === undefined) console.warn('No database settings: the run is written to eval/results only, not to eval_runs.')

const outcome = await runEvaluation(
  { root: `${here}set`, half, resultsDir: `${here}results`, accept: values.accept, limits, ...(values.limit === undefined ? {} : { limit: Number(values.limit) }) },
  {
    model: createBedrockComparisonModel({ awsRegion: region }),
    fingerprint: async (photo) => ({ sha256: createHash('sha256').update(photo).digest('hex'), perceptualHash: await perceptualHash(photo) }),
    database,
    now: () => new Date(),
    pipelineVersion: await pipelineVersion([`${repository}packages/compare/src`, `${repository}packages/vision/src`, `${repository}packages/domain/src`], PROMPT_VERSION),
  },
)
console.log(await readFile(outcome.reportPath, 'utf8'))
console.log(`Report: ${outcome.reportPath}`)
if (half === 'gate' && !outcome.gate.pass) {
  console.error(`The comparison failed the gate: ${outcome.gate.reasons.join(', ')}.`)
  process.exitCode = 1
}
