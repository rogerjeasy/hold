import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditLog, inShop, openDemoSession, opsRuns, proposals, shopExceptions, startSampleInvestigation, users } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import { asc, eq } from 'drizzle-orm'
import { createBedrockInvestigator } from '../src/bedrock-investigator.ts'
import { OPS_PROMPT_VERSION } from '../src/investigator.ts'
import { runOperations } from '../src/run-operations.ts'

// Records one live investigation of the demonstration's sample queue entries by the operations agent, for the public
// AI page to show (apps/web/src/features/operations/recorded-investigation.ts). The shop is a fresh demo on an
// in-memory database; only the investigator is real: Claude on Bedrock, with this machine's AWS credentials. PayPal's
// read tools answer from the samples' own records, said to be simulated, as they do for "Investigate the samples".
// It spends one sample investigation's tokens, at most 40,000:
//   AWS_PROFILE=wick-dev pnpm --filter @hold/ops record:sample
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'web', 'src', 'features', 'operations', 'recorded-investigation.json')
const region = process.env['AWS_REGION'] ?? 'us-east-1'

const database = await createTestDatabase()
const now = new Date()
const opened = await openDemoSession(database, { owner: { subject: 'recording-owner', email: 'tomas@recording.example' }, staff: { subject: 'recording-staff', email: 'jonas@recording.example' }, slug: 'ribeira-bikes-recording', paypal: undefined, now })
const [owner] = await database.select({ id: users.id }).from(users).where(eq(users.email, 'tomas@recording.example'))
if (owner === undefined) throw new Error('The demo owner was not created.')
const scope = { role: 'hold_app', shopId: opened.shopId, userId: owner.id } as const
const started = await inShop(database, scope, (transaction) => startSampleInvestigation(transaction, now))
if (!started.ok) throw new Error(`The samples could not be investigated: ${started.reason}.`)

await runOperations({
  database,
  now: () => new Date(),
  investigator: createBedrockInvestigator({ awsRegion: region }),
  // A sample's PayPal references were never on PayPal: no account is read and no reminder is sent.
  paypal: () => Promise.reject(new Error('No PayPal account is read for samples.')),
  remind: () => Promise.reject(new Error('No reminder is sent for samples.')),
}, { shopId: opened.shopId, trigger: 'manual', samplesRunId: started.runId })

const asWorker = <Result>(work: Parameters<typeof inShop<Result>>[2]) => inShop(database, { role: 'hold_worker', shopId: opened.shopId }, work)
const [run] = await asWorker((transaction) => transaction.select().from(opsRuns).where(eq(opsRuns.id, started.runId)))
const written = await asWorker((transaction) => transaction.select({ kind: proposals.kind, exceptionKind: shopExceptions.kind, reason: proposals.reason, references: proposals.references, draft: proposals.draft, model: proposals.model }).from(proposals).innerJoin(shopExceptions, eq(shopExceptions.id, proposals.exceptionId)).where(eq(proposals.runId, started.runId)).orderBy(asc(proposals.createdAt)))
const calls = await asWorker((transaction) => transaction.select({ action: auditLog.action, subjectId: auditLog.subjectId }).from(auditLog).where(eq(auditLog.source, started.runId)).orderBy(asc(auditLog.at)))
const investigated = written.filter((entry) => entry.model !== null)
// Only a run that Claude answered is worth showing as a live one.
if (run?.model === null || run === undefined || investigated.length === 0) throw new Error('Not recorded: Claude investigated no entry.')

const entries = investigated.map((entry) => ({ kind: entry.kind, exceptionKind: entry.exceptionKind, reason: entry.reason, references: entry.references, draft: entry.draft }))
const tools = [...new Set(calls.map((call) => call.action.replace(/^agent\.tool\./, '')))]
await writeFile(OUT, `${JSON.stringify({ recording: { recordedAt: new Date(), model: run.model, promptVersion: run.promptVersion ?? OPS_PROMPT_VERSION, toolCalls: run.toolCalls, tokens: run.inputTokens + run.outputTokens, tools, entries } }, null, 2)}\n`)
console.log(`Recorded ${String(entries.length)} entries in ${String(run.toolCalls)} tool calls and ${String(run.inputTokens + run.outputTokens)} tokens to ${OUT}.`)
// The in-memory database would keep the process alive once the recording is written.
await database.$client.close()
