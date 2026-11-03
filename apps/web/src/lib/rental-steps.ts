import type { RentalState } from '@hold/domain'

// The steps every rental passes, as staff and the renter both follow them.
export const RENTAL_STEPS = ['booked', 'paid', 'hold', 'out', 'returned', 'settled'] as const
export type RentalStep = (typeof RENTAL_STEPS)[number]

// How many of the steps a rental in this state has passed. A rental let go or cancelled stops where it was.
export const STEPS_REACHED: Readonly<Record<RentalState, number>> = {
  pending_payment: 1,
  abandoned: 1,
  booked: 2,
  awaiting_hold: 2,
  cancelled: 2,
  ready: 3,
  out: 4,
  overdue: 4,
  // Back at the drop point, but nobody at the shop has seen it yet.
  dropped_off: 4,
  returned: 5,
  inspecting: 5,
  settling: 5,
  closed: 6,
}
