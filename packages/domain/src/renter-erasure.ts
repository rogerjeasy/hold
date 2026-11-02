import { RENTAL_ENDED_STATES } from './rental.ts'
import type { RentalState } from './rental.ts'
import { fail, ok } from './result.ts'
import type { Result } from './result.ts'

// Erasing a renter's personal details on their request (architecture.md section 15.2). The shop's owner does it once
// none of the renter's rentals in the shop is still open. Their name, email and phone are replaced with this marker;
// the money log, approvals, audit trail and photographs stay as they were, since they are append-only.
export const ERASED = '[erased]'

export type ErasureProblem = 'not_found' | 'rental_open' | 'already_erased'

// The renter's rentals in one shop, and whether each was already erased.
export function checkRenterErasure(rentals: readonly { readonly state: RentalState; readonly erased: boolean }[]): Result<undefined, ErasureProblem> {
  if (rentals.length === 0) return fail('not_found')
  if (rentals.some((rental) => !RENTAL_ENDED_STATES.includes(rental.state))) return fail('rental_open')
  if (rentals.every((rental) => rental.erased)) return fail('already_erased')
  return ok(undefined)
}
