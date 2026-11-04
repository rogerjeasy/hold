import { readFile } from 'node:fs/promises'
import { inShop, negotiationRecords, negotiationTranscript, openDemoSession, openSampleAdvocates, rentals, renters, users } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import type { TestDatabase } from '@hold/db/testing'
import { withinMandate } from '@hold/domain'
import type { NegotiationSide } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { AdvocateModel } from './advocate-model.ts'
import { runNegotiation } from './runner.ts'

// The live run of the two advocates that the site shows (apps/web/src/features/negotiation/recorded-run.json, written
// by scripts/record-sample-run.ts from Claude on Bedrock), replayed: the same demonstration claim, set up as the
// recording set it up, and two stand-ins that answer each turn with the move Claude made at that turn. What it proves is
// the referee's side of the recording: it accepts exactly the moves it accepted live, and the agreement stays inside
// both sides' mandates, read from the records.

const RECORDING = new URL('../../../apps/web/src/features/negotiation/recorded-run.json', import.meta.url)
const line = z.object({ lineId: z.string(), cents: z.int(), ground: z.string().nullable(), evidence: z.array(z.string()) })
const recordingSchema = z.object({ recording: z.object({ model: z.string(), transcript: z.object({
  claimTotalCents: z.int(),
  agreedCents: z.int(),
  state: z.literal('agreed'),
  lines: z.array(z.object({ lineId: z.string(), publishedCents: z.int(), description: z.string() })),
  moves: z.array(z.object({ sequence: z.int(), side: z.enum(['shop', 'renter']), kind: z.enum(['offer', 'accept', 'pass']), lines: z.array(line), totalCents: z.int().nullable(), actor: z.string() })),
}) }) })
type Recorded = z.infer<typeof recordingSchema>['recording']

let database: TestDatabase
let recorded: Recorded
beforeAll(async () => {
  database = await createTestDatabase()
  recorded = recordingSchema.parse(JSON.parse(await readFile(RECORDING, 'utf8'))).recording
})
afterAll(async () => { await database.$client.close() })

// Answers each of a side's turns with that side's next recorded move, its lines renamed to this claim's line ids.
function replaying(side: NegotiationSide, rename: (lineId: string) => string): AdvocateModel {
  const moves = recorded.transcript.moves.filter((move) => move.side === side && move.actor !== 'referee')
  let turn = 0
  return {
    next() {
      const move = moves[turn]
      turn += 1
      const input = move?.kind === 'offer' ? { lines: move.lines.map((each) => ({ ...each, lineId: rename(each.lineId) })) } : {}
      return Promise.resolve({ kind: 'calls', calls: [{ id: `replay-${side}-${String(turn)}`, name: move?.kind ?? 'pass', input }], raw: null, model: `replay of ${recorded.model}`, inputTokens: 0, outputTokens: 0 })
    },
  }
}

describe('the recorded live advocates run, replayed through the runner and the referee', () => {
  it('is accepted move for move as it was live, and agrees inside both mandates', async () => {
    const started = new Date()
    const opened = await openDemoSession(database, { owner: { subject: 'replay-owner', email: 'tomas@replay.example' }, staff: { subject: 'replay-staff', email: 'jonas@replay.example' }, slug: 'ribeira-bikes-replay', paypal: undefined, now: started })
    const [owner] = await database.select({ id: users.id }).from(users).where(eq(users.email, 'tomas@replay.example'))
    const scope = { role: 'hold_app', shopId: opened.shopId, userId: owner?.id ?? '' } as const
    const [elena] = await inShop(database, scope, (transaction) => transaction.select({ rentalId: rentals.id }).from(rentals).innerJoin(renters, eq(renters.id, rentals.renterId)).where(eq(renters.name, 'Elena Duarte')))
    const rentalId = elena?.rentalId ?? ''
    const sample = await inShop(database, scope, (transaction) => openSampleAdvocates(transaction, rentalId, { simulated: false }, started))
    if (!sample.ok) throw new Error(sample.reason)

    // The same claim: its lines, by what they say, at the prices the recording showed. Their order is not the point.
    const before = await inShop(database, scope, (transaction) => negotiationTranscript(transaction, rentalId))
    const priced = (lines: readonly { readonly description: string; readonly publishedCents: number }[]) => lines.map((each) => `${each.description}: ${String(each.publishedCents)}`).sort()
    expect(priced(before?.lines ?? [])).toEqual(priced(recorded.transcript.lines))
    const ids = new Map(recorded.transcript.lines.map((each) => [each.lineId, before?.lines.find((mine) => mine.description === each.description)?.lineId ?? '']))
    const rename = (lineId: string) => ids.get(lineId) ?? lineId

    let reads = 0
    const now = () => new Date(started.getTime() + (reads += 1) * 1_000)
    const outcome = await runNegotiation({ database, role: 'hold_worker', models: { shop: replaying('shop', rename), renter: replaying('renter', rename) }, now }, { shopId: opened.shopId, negotiationId: sample.negotiationId })

    expect(outcome.state).toBe('agreed')
    const replayed = await inShop(database, scope, (transaction) => negotiationTranscript(transaction, rentalId))
    const shape = (moves: readonly { readonly side: string; readonly kind: string; readonly totalCents: number | null; readonly lines: readonly { readonly lineId: string; readonly cents: number; readonly ground: string | null; readonly evidence: readonly string[] }[] }[], renamed: (lineId: string) => string) =>
      moves.map((move) => ({ side: move.side, kind: move.kind, totalCents: move.totalCents, lines: move.lines.map((each) => ({ ...each, lineId: renamed(each.lineId) })).sort((first, second) => first.lineId.localeCompare(second.lineId)) }))
    expect(shape(replayed?.moves ?? [], (lineId) => lineId)).toEqual(shape(recorded.transcript.moves, rename))
    expect(replayed?.agreedCents).toBe(recorded.transcript.agreedCents)
    expect(replayed?.chainVerified).toBe(true)

    // Inside the shop's floor and the renter's ceiling, as plain code reads the two mandates.
    const records = await inShop(database, { role: 'hold_worker', shopId: opened.shopId }, (transaction) => negotiationRecords(transaction, sample.negotiationId))
    const agreed = { totalCents: recorded.transcript.agreedCents, claimTotalCents: recorded.transcript.claimTotalCents, currency: 'EUR' }
    if (records === undefined || records.shopMandate === null) throw new Error('Both sides need a mandate.')
    expect(withinMandate({ kind: 'settlement_accept', side: 'shop', ...agreed }, records.shopMandate, started)).toEqual({ ok: true })
    expect(withinMandate({ kind: 'settlement_offer', side: 'renter', ...agreed }, records.renterMandate, started)).toEqual({ ok: true })
  })
})
