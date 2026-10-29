import { paymentLapsed } from './booking.ts'
import { addDays } from './hold-clocks.ts'
import { PENDING_PAYMENT_MINUTES } from './rental.ts'
import type { RentalState } from './rental.ts'

// Renting through the renter's own assistant (extensions.md section 8): how long a quote and an agent token last,
// what a token may be used for, and how many unpaid bookings assistants may hold. Plain rules, no I/O.

// What an agent token may read or prepare on its one rental. None of them moves money: the person approves every
// payment in PayPal, and accepting or contesting a claim needs the person or a mandate. `extend` prices more days and
// prepares their PayPal order; the person approves it in PayPal (architecture.md section 6.14).
export const AGENT_SCOPES = ['rental', 'hold', 'condition', 'claim', 'record', 'extend'] as const
export type AgentScope = (typeof AGENT_SCOPES)[number]

export const ASSISTANT_LIMITS = {
  // A quote lasts as long as an unpaid booking keeps its items.
  quoteMinutes: PENDING_PAYMENT_MINUTES,
  // Bookings one caller may make in the time an unpaid booking keeps its items.
  bookingsPerCaller: 3,
  // Unpaid bookings made by assistants that one shop holds at once.
  unpaidPerShop: 5,
  // Calls a minute: from one network to the public tools, and with one agent token to its rental's tools.
  publicCallsPerMinute: 60,
  rentalCallsPerMinute: 60,
  // An agent token outlives its rental by this much, through the return and any claim's reply.
  tokenDaysAfterRental: 14,
  // The longest name a client may declare for itself, and the longest reply an assistant may draft.
  clientNameLength: 80,
  draftLength: 1000,
} as const

export type QuoteState = 'usable' | 'expired' | 'used'

// A booking is made from a quote once, before it expires.
export function quoteState(quote: { readonly expiresAt: Date; readonly rentalId: string | null }, now: Date): QuoteState {
  if (quote.rentalId !== null) return 'used'
  return now.getTime() < quote.expiresAt.getTime() ? 'usable' : 'expired'
}

export type AssistantBookingStatus = 'awaiting_payment' | 'paid' | 'expired' | 'cancelled'

export type AssistantBooking = {
  readonly state: RentalState
  readonly createdAt: Date
  // PayPal's capture of the fee is on record: a verified event or a read-back, never the assistant's word.
  readonly feeCaptured: boolean
  // A capture of the fee the renter approved has begun and must not be cut short.
  readonly captureBegun: boolean
}

// Where a booking an assistant made stands. An unpaid booking expires after fifteen minutes unless the renter's
// approval is already being captured.
export function assistantBookingStatus(booking: AssistantBooking, now: Date): AssistantBookingStatus {
  if (booking.state === 'cancelled') return 'cancelled'
  if (booking.feeCaptured) return 'paid'
  if (booking.state === 'abandoned') return 'expired'
  if (booking.state === 'pending_payment' && !booking.captureBegun && paymentLapsed(booking.createdAt, now)) return 'expired'
  return 'awaiting_payment'
}

// Whether a shop may take one more unpaid booking from an assistant.
export function mayBookUnpaid(input: { readonly unpaidInShop: number }): boolean {
  return input.unpaidInShop < ASSISTANT_LIMITS.unpaidPerShop
}

export function agentTokenExpiry(rentalEndsAt: Date): Date {
  return addDays(rentalEndsAt, ASSISTANT_LIMITS.tokenDaysAfterRental)
}

// A token not yet issued has no end date and works for nothing. Revocation takes effect at the very next call.
export function agentSessionLive(session: { readonly expiresAt: Date | null; readonly revokedAt: Date | null }, now: Date): boolean {
  if (session.expiresAt === null || now.getTime() >= session.expiresAt.getTime()) return false
  return session.revokedAt === null || now.getTime() < session.revokedAt.getTime()
}
