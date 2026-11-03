import { and, eq, sql } from 'drizzle-orm'
import { COMPARISONS_QUEUE } from './return-repository.ts'
import { captureSessions, comparisons, outbox, rentalItems, rentals } from './schema/index.ts'
import type { Transaction } from './scope.ts'

export type SampleComparisonStart =
  | { readonly ok: true; readonly rentalId: string; readonly comparisonId: string }
  | { readonly ok: false; readonly reason: 'not_found' | 'not_a_sample' | 'nothing_to_compare' | 'already_started' }

// Hands a sample return's waiting comparison to the comparison worker, as sealing a return does (return-repository.ts):
// the message is written in this transaction, so it is sent once whatever happens next. Only a sample, whose photographs
// are the demonstration's own, is started by hand; a real return's comparison is queued when it is sealed. Nothing here
// moves money or changes the rental: the worker does what it does for any comparison.
export async function startSampleComparison(transaction: Transaction, rentalId: string, now: Date): Promise<SampleComparisonStart> {
  const [rental] = await transaction.select({ shopId: rentals.shopId, simulated: rentals.simulated }).from(rentals).where(eq(rentals.id, rentalId))
  if (rental === undefined) return { ok: false, reason: 'not_found' }
  if (!rental.simulated) return { ok: false, reason: 'not_a_sample' }
  const [waiting] = await transaction.select({ id: comparisons.id }).from(comparisons)
    .innerJoin(captureSessions, eq(captureSessions.id, comparisons.returnSessionId)).innerJoin(rentalItems, eq(rentalItems.id, captureSessions.rentalItemId))
    .where(and(eq(rentalItems.rentalId, rentalId), eq(comparisons.state, 'pending'))).for('update', { of: comparisons })
  if (waiting === undefined) return { ok: false, reason: 'nothing_to_compare' }
  if (await comparisonQueued(transaction, waiting.id)) return { ok: false, reason: 'already_started' }
  await transaction.insert(outbox).values({ shopId: rental.shopId, queue: COMPARISONS_QUEUE, messageGroup: rentalId, payload: { comparisonId: waiting.id }, createdAt: now })
  return { ok: true, rentalId, comparisonId: waiting.id }
}

// Whether a comparison has been handed to the worker: its message is in the outbox, sent or not.
export async function comparisonQueued(transaction: Transaction, comparisonId: string): Promise<boolean> {
  const [message] = await transaction.select({ id: outbox.id }).from(outbox).where(and(eq(outbox.queue, COMPARISONS_QUEUE), sql`${outbox.payload} ->> 'comparisonId' = ${comparisonId}`)).limit(1)
  return message !== undefined
}
