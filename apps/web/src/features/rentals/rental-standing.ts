import type { RentalSummary } from '@hold/db'

// The filters on the rentals page, each a part of a rental's life. An unpaid booking that ran out of time is done.
export const RENTAL_FILTERS = ['all', 'waiting', 'booked', 'out', 'returned', 'done'] as const
export type RentalFilter = (typeof RENTAL_FILTERS)[number]

export type RentalPart = Exclude<RentalFilter, 'all'>

export function partOf(rental: Pick<RentalSummary, 'state' | 'paymentLapsed'>): RentalPart {
  switch (rental.state) {
    case 'pending_payment':
      return rental.paymentLapsed ? 'done' : 'waiting'
    case 'booked':
    case 'awaiting_hold':
    case 'ready':
      return 'booked'
    case 'out':
    case 'overdue':
      return 'out'
    case 'dropped_off':
    case 'returned':
    case 'inspecting':
    case 'settling':
      return 'returned'
    case 'closed':
    case 'cancelled':
    case 'abandoned':
      return 'done'
  }
}

export function readRentalFilter(value: unknown): RentalFilter {
  return RENTAL_FILTERS.find((filter) => filter === value) ?? 'all'
}
