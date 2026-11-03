import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inShop, negotiationTranscript, openDemoSession, openSampleAdvocates, rentals, renters, users } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import { eq } from 'drizzle-orm'
import { ADVOCATE_PROMPT_VERSION } from '../src/prompts.ts'
import { createBedrockAdvocateModel } from '../src/bedrock-advocate-model.ts'
import { runNegotiation } from '../src/runner.ts'

// Records one live run of the two advocates on the demonstration's sample claim, for the claim page to show when no
// live run is left today (apps/web/src/features/negotiation/recorded-run.ts). The shop is a fresh demo on an
// in-memory database; only the two advocates are real: Claude on Bedrock, with this machine's AWS credentials.
// It spends one sample run's tokens, at most 80,000:
//   AWS_PROFILE=wick-dev pnpm --filter @hold/negotiate record:sample
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'web', 'src', 'features', 'negotiation', 'recorded-run.json')
const region = process.env['AWS_REGION'] ?? 'us-east-1'

const database = await createTestDatabase()
const now = new Date()
const opened = await openDemoSession(database, { owner: { subject: 'recording-owner', email: 'tomas@recording.example' }, staff: { subject: 'recording-staff', email: 'jonas@recording.example' }, slug: 'ribeira-bikes-recording', paypal: undefined, now })
const [owner] = await database.select({ id: users.id }).from(users).where(eq(users.email, 'tomas@recording.example'))
if (owner === undefined) throw new Error('The demo owner was not created.')
const scope = { role: 'hold_app', shopId: opened.shopId, userId: owner.id } as const
const [elena] = await inShop(database, scope, (transaction) => transaction.select({ rentalId: rentals.id }).from(rentals).innerJoin(renters, eq(renters.id, rentals.renterId)).where(eq(renters.name, 'Elena Duarte')))
if (elena === undefined) throw new Error('The sample claim waiting for its reply was not found.')
const sample = await inShop(database, scope, (transaction) => openSampleAdvocates(transaction, elena.rentalId, { simulated: false }, now))
if (!sample.ok) throw new Error(`The sample could not be handed to the advocates: ${sample.reason}.`)

const outcome = await runNegotiation({ database, role: 'hold_worker', models: { shop: createBedrockAdvocateModel({ awsRegion: region }), renter: createBedrockAdvocateModel({ awsRegion: region }) }, now: () => new Date() }, { shopId: opened.shopId, negotiationId: sample.negotiationId })
const transcript = await inShop(database, scope, (transaction) => negotiationTranscript(transaction, elena.rentalId))
const model = transcript?.moves.find((move) => move.model !== null)?.model
// Only a finished run that Claude moved in is worth showing as a live one.
if (transcript === undefined || transcript.state === 'open' || transcript.simulated || model === undefined || model === null) throw new Error(`Not recorded: the run ended ${outcome.state} with no live move to show.`)

await writeFile(OUT, `${JSON.stringify({ recording: { recordedAt: new Date(), model, promptVersion: ADVOCATE_PROMPT_VERSION, calls: outcome.calls, tokens: outcome.tokens, transcript } }, null, 2)}\n`)
console.log(`Recorded a ${transcript.state} run in ${String(outcome.calls)} calls and ${String(outcome.tokens)} tokens to ${OUT}.`)
