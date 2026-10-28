import { addDays, HOLD_ASSURED_DAYS } from './hold-clocks.ts'
import type { Money } from './money.ts'
import { fail, ok } from './result.ts'
import type { Result } from './result.ts'
import type { RentalState } from './rental.ts'
import type { AuthorizationClocks } from './upkeep.ts'

// Placing the hold at the counter (architecture.md sections 8.2 and 8.4). The fee is paid; at pickup the renter
// approves the hold on their own phone, and the server authorizes it.

// Staff ask for the hold once the fee is paid, and may ask again while the renter has not approved it.
export function mayAskForHold(state: RentalState): boolean {
  return state === 'booked' || state === 'awaiting_hold'
}

// Both clocks, from what PayPal reported on the authorization. The end of validity is PayPal's own; the assured period
// runs from the authorization's creation and never past its end.
export function authorizationClocks(authorization: { readonly createdAt: Date; readonly expiresAt: Date }, isRenewal: boolean): AuthorizationClocks {
  const assured = addDays(authorization.createdAt, HOLD_ASSURED_DAYS)
  return { assuredUntil: assured < authorization.expiresAt ? assured : authorization.expiresAt, validUntil: authorization.expiresAt, isRenewal }
}

// PayPal reported a renewal ending one second after the original in the sandbox on 28 October 2026. A minute allows
// for that rounding and nothing a renter would notice.
const RENEWAL_END_ALLOWANCE_MS = 60_000

// A renewal never holds the renter's money past the original authorization's 29 days.
export function keepsOriginalEnd(originalEnd: Date, renewedEnd: Date): boolean {
  return renewedEnd.getTime() <= originalEnd.getTime() + RENEWAL_END_ALLOWANCE_MS
}

export type PlacedAuthorizationStatus = 'pending' | 'created' | 'partially_captured' | 'captured' | 'voided' | 'denied' | 'expired'

export type PlacementProblem = 'pending' | 'amount_mismatch' | 'not_placed'

// A hold counts as placed only when PayPal shows a created authorization for exactly what the renter agreed to.
export function checkPlacedAuthorization(asked: Money, authorization: { readonly status: PlacedAuthorizationStatus; readonly amount: Money }): Result<'placed', PlacementProblem> {
  if (authorization.status === 'pending') return fail('pending')
  if (authorization.status !== 'created') return fail('not_placed')
  if (authorization.amount.cents !== asked.cents || authorization.amount.currency !== asked.currency) return fail('amount_mismatch')
  return ok('placed')
}

// A hold near its end is replaced while its rental may still need it: from placement until the rental is settled
// (architecture.md section 7.4). A closed or cancelled rental needs no hold.
const NEEDS_ITS_HOLD: ReadonlySet<RentalState> = new Set(['ready', 'out', 'overdue', 'returned', 'inspecting', 'settling'])

export function needsReplacement(state: RentalState): boolean {
  return NEEDS_ITS_HOLD.has(state)
}
