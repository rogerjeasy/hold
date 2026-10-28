import { addDays, HOLD_ASSURED_DAYS } from './hold-clocks.ts'
import type { Money } from './money.ts'
import { fail, ok } from './result.ts'
import type { Result } from './result.ts'
import type { RentalState } from './rental.ts'
import { shopDay } from './shop-calendar.ts'
import type { AuthorizationClocks } from './upkeep.ts'

// Placing the hold at the counter (architecture.md sections 8.2 and 8.4). The fee is paid; at pickup the renter
// approves the hold on their own phone, and the server authorizes it.

export type PlacementStrategy = 'at_counter' | 'combined'

// How the hold is placed (architecture.md section 8.2). Staff may let a walk-in approve the fee and the hold once: one
// authorization for both, with the fee captured from it at once. They choose it, for a rental at the counter that
// starts on the shop's own today, because a returning renter's record lowers the hold only once their fee tells Hold
// who they are. Any other rental pays the fee at booking and approves the hold at pickup, as a hold lasts 29 days.
export function placementStrategy(rental: { readonly asked: PlacementStrategy; readonly bookedThrough: 'staff' | 'shop_page' | 'assistant'; readonly startsAt: Date; readonly timeZone: string; readonly now: Date }): PlacementStrategy {
  if (rental.asked !== 'combined' || rental.bookedThrough !== 'staff') return 'at_counter'
  return rental.startsAt < shopDay(rental.timeZone, rental.now).end ? 'combined' : 'at_counter'
}

// What the renter approves in PayPal for the hold: a walk-in's first order carries the fee with it; any other order,
// a replacement included, is for the hold alone.
export function holdOrderCents(hold: { readonly strategy: string; readonly state: string; readonly reservedCents: number; readonly feeCents: number }): number {
  return hold.strategy === 'combined' && hold.state === 'requested' ? hold.reservedCents + hold.feeCents : hold.reservedCents
}

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
