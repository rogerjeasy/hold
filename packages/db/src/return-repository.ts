import { RENTAL_TRANSITIONS, transition } from '@hold/domain'
import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { captureSessions, comparisons, items, outbox, photos, rentalItems, rentals } from './schema/index.ts'
import type { Transaction } from './scope.ts'
import { lapseUnagreedOffers } from './incident-closing.ts'

export const COMPARISONS_QUEUE = 'comparisons'

// Called in the sealing transaction. A rental is returned only after all its items have sealed return evidence.
// The comparison and its message are written together, so retries cannot lose or multiply the work. A return the renter
// photographed leaves the rental dropped off, from now, until a person has seen the item (architecture.md section 6.13).
export async function queueReturnComparisons(transaction: Transaction, rentalId: string, now: Date): Promise<void> {
  const [rental] = await transaction.select().from(rentals).where(eq(rentals.id, rentalId)).for('update')
  if (rental === undefined) return
  const all = await transaction.select({ id: rentalItems.id }).from(rentalItems).where(eq(rentalItems.rentalId, rentalId))
  const sealed = await transaction
    .select({ id: captureSessions.id, kind: captureSessions.kind, rentalItemId: captureSessions.rentalItemId, byRenter: captureSessions.byRenter })
    .from(captureSessions).innerJoin(rentalItems, eq(rentalItems.id, captureSessions.rentalItemId))
    .where(and(eq(rentalItems.rentalId, rentalId), isNotNull(captureSessions.sealedAt)))
  const returned = sealed.filter((row) => row.kind === 'return')
  if (returned.length !== all.length) return
  const target = returned.some((row) => row.byRenter) ? 'dropped_off' : 'returned'
  if (!transition(RENTAL_TRANSITIONS, rental.state, target).ok) return
  for (const session of returned) {
    const handover = sealed.find((row) => row.kind === 'handover' && row.rentalItemId === session.rentalItemId)
    if (handover === undefined) throw new Error('A return has no sealed handover.')
    const [created] = await transaction.insert(comparisons)
      .values({ shopId: rental.shopId, handoverSessionId: handover.id, returnSessionId: session.id, createdAt: now })
      .onConflictDoNothing().returning({ id: comparisons.id })
    if (created !== undefined) await transaction.insert(outbox).values({ shopId: rental.shopId, queue: COMPARISONS_QUEUE, messageGroup: rentalId, payload: { comparisonId: created.id }, createdAt: now })
  }
  await transaction.update(rentals).set(target === 'dropped_off' ? { state: target, droppedOffAt: now } : { state: target }).where(eq(rentals.id, rentalId))
  await lapseUnagreedOffers(transaction, rentalId)
}

export type RentalReturn = { readonly itemId: string; readonly label: string; readonly sessionId: string | null; readonly sealed: boolean; readonly comparisonId: string | null }

export async function rentalReturns(transaction: Transaction, rentalId: string): Promise<readonly RentalReturn[]> {
  const rows = await transaction
    .select({ itemId: rentalItems.itemId, label: items.label, sessionId: captureSessions.id, sealedAt: captureSessions.sealedAt, comparisonId: comparisons.id })
    .from(rentalItems).innerJoin(items, eq(items.id, rentalItems.itemId))
    .leftJoin(captureSessions, and(eq(captureSessions.rentalItemId, rentalItems.id), eq(captureSessions.kind, 'return')))
    .leftJoin(comparisons, eq(comparisons.returnSessionId, captureSessions.id))
    .where(eq(rentalItems.rentalId, rentalId)).orderBy(asc(rentalItems.id))
  return rows.map((row) => ({ ...row, sealed: row.sealedAt !== null }))
}

// Only the sealed staff handover is a baseline; renter additions never replace it. A return and a renter's incident
// report both show it faintly behind the camera.
export async function returnBaseline(transaction: Transaction, sessionId: string) {
  const [session] = await transaction.select({ rentalItemId: captureSessions.rentalItemId, kind: captureSessions.kind }).from(captureSessions).where(eq(captureSessions.id, sessionId))
  if (session?.kind !== 'return' && session?.kind !== 'incident') return []
  return transaction.select({ view: photos.view, displayKey: photos.displayKey, simulated: sql<boolean>`coalesce((${photos.quality} ->> 'simulated')::int = 1, false)` })
    .from(photos).innerJoin(captureSessions, eq(captureSessions.id, photos.sessionId))
    .where(and(eq(captureSessions.rentalItemId, session.rentalItemId), eq(captureSessions.kind, 'handover'), isNotNull(captureSessions.sealedAt), isNull(photos.supersededAt))).orderBy(asc(photos.view))
}
