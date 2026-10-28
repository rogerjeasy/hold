import type { CalendarBooking, ShopCalendar } from '@hold/db'
import { describe, expect, it } from 'vitest'
import { calendarModel, STANDING_COLORS, standingOf } from './calendar-model'

const booking = (overrides: Partial<CalendarBooking>): CalendarBooking => ({
  rentalId: 'rental-1',
  itemId: 'item-1',
  startsAt: new Date('2026-10-14T09:00:00Z'),
  endsAt: new Date('2026-10-16T17:00:00Z'),
  renterName: 'Priya Natarajan',
  rentalState: 'out',
  holdState: 'placed',
  simulated: false,
  ...overrides,
})

describe('where a rental on the calendar stands', () => {
  it('is held while PayPal holds the deposit for an item that is out', () => {
    expect(standingOf(booking({}))).toBe('held')
    expect(standingOf(booking({ rentalState: 'ready', holdState: 'placed' }))).toBe('held')
  })

  it('waits on the renter while the fee or the hold is still to approve', () => {
    for (const [rentalState, holdState] of [['pending_payment', null], ['booked', null], ['awaiting_hold', 'requested']] as const) {
      expect(standingOf(booking({ rentalState, holdState }))).toBe('awaiting')
    }
  })

  it('is late when the item is overdue, being settled once it is back, and done once closed', () => {
    expect(standingOf(booking({ rentalState: 'overdue' }))).toBe('late')
    for (const rentalState of ['returned', 'inspecting', 'settling'] as const) expect(standingOf(booking({ rentalState }))).toBe('settling')
    expect(standingOf(booking({ rentalState: 'closed', holdState: 'released' }))).toBe('done')
  })
})

describe('the calendar the scheduler draws', () => {
  it('makes each item a row and each booking a bar on its item, named for the renter and linked to the rental', () => {
    const calendar: ShopCalendar = {
      items: [{ id: 'item-1', label: 'City bike 1', typeName: 'City bike', simulated: false }],
      bookings: [booking({}), booking({ rentalId: 'rental-2', renterName: null, rentalState: 'overdue', simulated: true })],
    }
    const model = calendarModel(calendar, 'Renter not known yet')
    expect(model.resources).toEqual([{ id: 'item-1', name: 'City bike 1', type: 'City bike' }])
    expect(model.events).toEqual([
      { id: 'rental-1:item-1', resourceId: 'item-1', rentalId: 'rental-1', startDate: '2026-10-14T09:00:00.000Z', endDate: '2026-10-16T17:00:00.000Z', name: 'Priya Natarajan', standing: 'held', simulated: false, cls: 'hold-standing-held', eventColor: STANDING_COLORS.held },
      { id: 'rental-2:item-1', resourceId: 'item-1', rentalId: 'rental-2', startDate: '2026-10-14T09:00:00.000Z', endDate: '2026-10-16T17:00:00.000Z', name: 'Renter not known yet', standing: 'late', simulated: true, cls: 'hold-standing-late', eventColor: STANDING_COLORS.late },
    ])
  })
})
