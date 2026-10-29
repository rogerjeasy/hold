import type { Transitions } from './state-machine.ts'

export const RENTAL_STATES = [
  'pending_payment',
  'booked',
  'awaiting_hold',
  'ready',
  'out',
  'overdue',
  // The renter photographed it and left it at the shop's drop point; nobody at the shop has seen it yet (section 6.13).
  'dropped_off',
  'returned',
  'inspecting',
  'settling',
  'closed',
  'cancelled',
  'abandoned',
] as const

export type RentalState = (typeof RENTAL_STATES)[number]

// architecture.md section 7.1.
export const RENTAL_TRANSITIONS: Transitions<RentalState> = {
  pending_payment: ['booked', 'abandoned'],
  booked: ['awaiting_hold', 'cancelled'],
  awaiting_hold: ['ready', 'cancelled'],
  ready: ['out', 'cancelled'],
  out: ['overdue', 'returned', 'dropped_off'],
  overdue: ['returned', 'dropped_off'],
  // Only a person who saw the item at the drop point makes it returned.
  dropped_off: ['returned'],
  returned: ['inspecting'],
  inspecting: ['settling'],
  settling: ['closed'],
  closed: [],
  cancelled: [],
  abandoned: [],
}

// A booking keeps its item this long while the fee is unpaid.
export const PENDING_PAYMENT_MINUTES = 15
