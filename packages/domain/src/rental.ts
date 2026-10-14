import type { Transitions } from './state-machine.ts'

export const RENTAL_STATES = [
  'pending_payment',
  'booked',
  'awaiting_hold',
  'ready',
  'out',
  'overdue',
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
  out: ['overdue', 'returned'],
  overdue: ['returned'],
  returned: ['inspecting'],
  inspecting: ['settling'],
  settling: ['closed'],
  closed: [],
  cancelled: [],
  abandoned: [],
}

// A booking keeps its item this long while the fee is unpaid.
export const PENDING_PAYMENT_MINUTES = 15
