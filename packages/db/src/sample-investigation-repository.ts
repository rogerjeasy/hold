import { DETECTOR_PROPOSALS } from '@hold/domain'
import type { ProposalKind } from '@hold/domain'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { RecordedException } from './ops-repository.ts'
import { OPS_AGENT_QUEUE } from './ops-repository.ts'
import { opsRuns, outbox, proposals, rentals, shopExceptions, shops } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// A demo shop's sample entries on the morning queue are seeded as no model looked at them. When the owner asks, the
// operations agent investigates them for real, with PayPal's facts simulated (extensions.md section 6.14). The run is
// an ops run like any other, marked by its counts as the samples' own.

// A run that has not finished by then is taken to have stopped: the worker's ten minutes are over.
const STALLED_AFTER_MS = 10 * 60_000
const isSamplesRun = sql`(${opsRuns.counts}->>'samples') is not null`

// currency: the sample rental's, the only one an amount in a drafted message may be in.
export type SampleEntry = { readonly id: string; readonly kind: ProposalKind; readonly currency: string | null; readonly exception: RecordedException }

// The sample entries still waiting that no model has looked at, each with the exception it rests on.
export async function sampleEntriesToInvestigate(transaction: Transaction): Promise<SampleEntry[]> {
  const rows = await transaction.select({ id: proposals.id, kind: proposals.kind, currency: rentals.currency, exception: shopExceptions }).from(proposals).innerJoin(shopExceptions, eq(shopExceptions.id, proposals.exceptionId))
    .leftJoin(rentals, eq(rentals.id, proposals.rentalId))
    .where(and(eq(proposals.state, 'pending'), sql`${proposals.payload}->>'simulated' = 'yes'`, sql`${proposals.payload}->>'investigated' = 'no'`))
  return rows.map(({ id, kind, currency, exception }) => ({
    id,
    kind,
    currency,
    exception: { id: exception.id, kind: exception.kind, subjectKind: exception.subjectKind as RecordedException['subjectKind'], subjectId: exception.subjectId, rentalId: exception.rentalId, allowed: DETECTOR_PROPOSALS[exception.kind], reminder: null, deadline: exception.deadline, moneyCents: exception.moneyCents, fingerprint: exception.fingerprint },
  }))
}

export type SampleInvestigationStatus = {
  readonly runId: string
  readonly state: 'running' | 'stalled' | 'completed' | 'failed'
  readonly startedAt: Date
  readonly completedAt: Date | null
  // How many entries the model's answer rewrote, and the model that gave it; none when Claude did not answer.
  readonly investigated: number
  readonly model: string | null
}

// How the shop's last investigation of its samples stands, for the queue page; undefined if it never asked.
export async function sampleInvestigation(transaction: Transaction, now: Date): Promise<SampleInvestigationStatus | undefined> {
  const [run] = await transaction.select().from(opsRuns).where(isSamplesRun).orderBy(desc(opsRuns.startedAt)).limit(1)
  if (run === undefined) return undefined
  const stalled = run.state === 'running' && now.getTime() - run.startedAt.getTime() > STALLED_AFTER_MS
  return { runId: run.id, state: stalled ? 'stalled' : run.state, startedAt: run.startedAt, completedAt: run.completedAt, investigated: run.counts['investigated'] ?? 0, model: run.model }
}

export type SampleInvestigationStart = { readonly ok: true; readonly runId: string; readonly at: Date } | { readonly ok: false; readonly reason: 'running' | 'no_samples' }

// Opens the run and hands it to the ops-agent queue through the outbox, ordered per shop. The relay adds the shop.
export async function startSampleInvestigation(transaction: Transaction, now: Date): Promise<SampleInvestigationStart> {
  if ((await sampleInvestigation(transaction, now))?.state === 'running') return { ok: false, reason: 'running' }
  const [waiting] = await transaction.select({ id: proposals.id }).from(proposals).innerJoin(shopExceptions, eq(shopExceptions.id, proposals.exceptionId))
    .where(and(eq(proposals.state, 'pending'), sql`${proposals.payload}->>'simulated' = 'yes'`, sql`${proposals.payload}->>'investigated' = 'no'`)).limit(1)
  if (waiting === undefined) return { ok: false, reason: 'no_samples' }
  const [shop] = await transaction.select({ id: shops.id }).from(shops).limit(1)
  if (shop === undefined) throw new Error('No shop in scope.')
  const [run] = await transaction.insert(opsRuns).values({ shopId: shop.id, trigger: 'manual', startedAt: now, counts: { samples: 1 } }).returning({ id: opsRuns.id })
  if (run === undefined) throw new Error('The run was not recorded.')
  await transaction.insert(outbox).values({ shopId: shop.id, queue: OPS_AGENT_QUEUE, messageGroup: shop.id, payload: { trigger: 'manual', samplesRunId: run.id }, createdAt: now })
  return { ok: true, runId: run.id, at: now }
}

export type SampleAnswer = { readonly reason: string; readonly references: readonly string[]; readonly draft: string | null; readonly model: string; readonly promptVersion: string; readonly runId: string | null }

// Writes what the model answered over a waiting sample entry, through the one function that may (migration 0046).
// False for any entry that is not a waiting sample of this shop.
export async function recordSampleInvestigation(transaction: Transaction, proposalId: string, answer: SampleAnswer, now: Date): Promise<boolean> {
  const [row] = await transaction.select({ written: sql<boolean>`written` })
    .from(sql`hold_record_sample_investigation(${proposalId}::uuid, ${answer.reason}, ${JSON.stringify(answer.references)}::jsonb, ${answer.draft}, ${answer.model}, ${answer.promptVersion}, ${answer.runId}::uuid, ${now.toISOString()}::timestamptz) as recorded(written)`)
  return row?.written === true
}
