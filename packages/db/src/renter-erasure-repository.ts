import { checkRenterErasure, ERASED } from '@hold/domain'
import type { ErasureProblem } from '@hold/domain'
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { pushDevices, rentals, textMessages } from './schema/index.ts'
import type { Transaction } from './scope.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ErasureResult = { readonly ok: true; readonly rentals: number } | { readonly ok: false; readonly reason: ErasureProblem }

// Erases the personal details of the renter of this rental from every one of their rentals in the transaction's shop
// (architecture.md section 15.2), once all have ended. A rental PayPal never named a payer for stands alone. The name,
// email and phone the shop booked with become the marker, as do the numbers and words of its texts; the renter's phone
// is no longer reached by push. The money log, approvals, audit trail and photographs are not touched. The renter's
// PayPal name and email go once no shop holds an unerased rental of theirs.
export async function eraseRenter(transaction: Transaction, rentalId: string, now: Date): Promise<ErasureResult> {
  if (!UUID.test(rentalId)) return { ok: false, reason: 'not_found' }
  const [named] = await transaction.select({ renterId: rentals.renterId }).from(rentals).where(eq(rentals.id, rentalId))
  if (named === undefined) return { ok: false, reason: 'not_found' }
  const { renterId } = named
  const theirs = await transaction
    .select({ id: rentals.id, state: rentals.state, erasedAt: rentals.renterErasedAt })
    .from(rentals)
    .where(renterId === null ? eq(rentals.id, rentalId) : eq(rentals.renterId, renterId))
  const allowed = checkRenterErasure(theirs.map((rental) => ({ state: rental.state, erased: rental.erasedAt !== null })))
  if (!allowed.ok) return { ok: false, reason: allowed.error }
  const ids = theirs.filter((rental) => rental.erasedAt === null).map((rental) => rental.id)
  await transaction
    .update(rentals)
    .set({
      contactName: sql`case when ${rentals.contactName} is null then null else ${ERASED} end`,
      contactEmail: sql`case when ${rentals.contactEmail} is null then null else ${ERASED} end`,
      // Nobody is texted about an ended rental, so it falls back to email, which reaches nobody either.
      contactChannel: 'email',
      contactPhone: null,
      phoneConfirmedAt: null,
      phoneCodeHash: null,
      phoneCodeExpiresAt: null,
      renterErasedAt: now,
    })
    .where(inArray(rentals.id, ids))
  await transaction.update(textMessages).set({ toPhone: ERASED }).where(inArray(textMessages.rentalId, ids))
  await transaction.update(textMessages).set({ body: ERASED }).where(and(inArray(textMessages.rentalId, ids), isNotNull(textMessages.body)))
  await transaction.update(pushDevices).set({ revokedAt: now }).where(and(inArray(pushDevices.rentalId, ids), isNull(pushDevices.revokedAt)))
  if (renterId !== null) await transaction.execute(sql`select hold_erase_renter_identity(${renterId}::uuid)`)
  return { ok: true, rentals: ids.length }
}
