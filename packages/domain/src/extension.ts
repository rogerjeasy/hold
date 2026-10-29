import { money } from './money.ts'
import type { Money } from './money.ts'
import type { RentalState } from './rental.ts'
import { fail, ok } from './result.ts'
import type { Result } from './result.ts'
import type { Transitions } from './state-machine.ts'

// A renter keeps the item longer, from their own phone (architecture.md section 6.14). It goes through as soon as the
// extra days are paid in PayPal, with nobody at the shop to ask, so plain code checks everything the shop would: the
// days are free, the hold still covers the return and a claim, and the shop allows that many extra days. The hold
// itself is never touched.

const HOUR = 3_600_000
const DAY = 24 * HOUR

// quoted: priced for a new end the renter chose; ordered: its PayPal order made; capturing: approved in PayPal, the new
// end applied while the worker captures; paid: PayPal's capture read back; failed: PayPal refused it and the old end
// came back; replaced: the renter chose another end before paying.
export const EXTENSION_STATES = ['quoted', 'ordered', 'capturing', 'paid', 'failed', 'replaced'] as const
export type ExtensionState = (typeof EXTENSION_STATES)[number]

export const EXTENSION_TRANSITIONS: Transitions<ExtensionState> = {
  quoted: ['ordered', 'replaced'],
  ordered: ['capturing', 'replaced'],
  capturing: ['paid', 'failed'],
  paid: [],
  failed: [],
  replaced: [],
}

export const EXTENSION_LIMITS = {
  // What a shop allows when its owner has not said: a week more at most.
  defaultMaxDays: 7,
  // The most a shop may allow, as a booking is at most four weeks long.
  maxDays: 28,
  // The days a hold must still have after the new end: to check the return, draft and approve a claim, and charge it
  // the day before the hold would lapse (section 7.5).
  returnToCaptureDays: 2,
  // A capture PayPal reports as pending is waited for at least this long, however near the old end.
  pendingPaymentHours: 24,
} as const

// When Hold stops waiting on a capture PayPal reports as pending (architecture.md section 6.14). Until the old end the
// renter keeps only days they already paid for, so waiting costs nothing; past it, the extra days are not given on
// money PayPal has not settled. The old end comes back, and a payment PayPal completes later goes to a person.
export function extensionPaymentDeadline(oldEndsAt: Date, captureBeganAt: Date): Date {
  return new Date(Math.max(oldEndsAt.getTime(), captureBeganAt.getTime() + EXTENSION_LIMITS.pendingPaymentHours * 3_600_000))
}

export type ExtensionRequest = {
  readonly state: RentalState
  readonly startsAt: Date
  readonly endsAt: Date
  readonly newEndsAt: Date
  readonly now: Date
  // Zero when the shop allows no extensions.
  readonly maxDays: number
  // When PayPal stops holding the renter's money; null with no hold placed.
  readonly holdValidUntil: Date | null
  // Each item's day rate as agreed at booking, read from the rental, never from the renter.
  readonly lines: readonly { readonly dayRateCents: number; readonly count: number }[]
  readonly currency: string
  // The earliest start of another booking that needs one of the items between the current and the new end.
  readonly nextBookingStartsAt: Date | null
}

export type ExtensionProblem =
  | { readonly kind: 'not_out' }
  | { readonly kind: 'not_later' }
  | { readonly kind: 'off' }
  | { readonly kind: 'too_many_days'; readonly maxDays: number }
  | { readonly kind: 'no_hold' }
  | { readonly kind: 'beyond_hold'; readonly latest: Date }
  | { readonly kind: 'not_free'; readonly neededFrom: Date }

export type ExtensionTerms = { readonly extraDays: number; readonly fee: Money; readonly endsAt: Date }

// Each started 24 hours past the current end is a day, at the day rates agreed at booking.
export function checkExtension(request: ExtensionRequest): Result<ExtensionTerms, ExtensionProblem> {
  const { endsAt, newEndsAt, now } = request
  if (request.state !== 'out') return fail({ kind: 'not_out' })
  if (newEndsAt.getTime() <= endsAt.getTime() || newEndsAt.getTime() <= now.getTime()) return fail({ kind: 'not_later' })
  if (request.maxDays <= 0) return fail({ kind: 'off' })
  const extraDays = Math.ceil((newEndsAt.getTime() - endsAt.getTime()) / DAY)
  if (extraDays > request.maxDays) return fail({ kind: 'too_many_days', maxDays: request.maxDays })
  if (request.holdValidUntil === null) return fail({ kind: 'no_hold' })
  const latest = new Date(request.holdValidUntil.getTime() - EXTENSION_LIMITS.returnToCaptureDays * DAY)
  if (newEndsAt.getTime() > latest.getTime()) return fail({ kind: 'beyond_hold', latest })
  if (request.nextBookingStartsAt !== null) return fail({ kind: 'not_free', neededFrom: request.nextBookingStartsAt })
  const dayCents = request.lines.reduce((sum, line) => sum + line.dayRateCents * line.count, 0)
  return ok({ extraDays, fee: money(dayCents * extraDays, request.currency), endsAt: newEndsAt })
}
