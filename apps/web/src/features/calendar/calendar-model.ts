import type { CalendarBooking, ShopCalendar } from '@hold/db'

// What the shop's calendar draws (extensions.md section 12.5): each item a row, each rental a bar on the items it took,
// marked by where its PayPal hold stands. The bar's words and its mark say the same, so colour is never alone.

export const STANDINGS = ['held', 'awaiting', 'late', 'settling', 'done'] as const
export type Standing = (typeof STANDINGS)[number]

// The scheduler paints its bars itself, so the calendar's colours are values rather than the app's tokens. They are
// defined here once, for the bars and the legend alike, and every bar also says its standing in words.
export const STANDING_COLORS: Readonly<Record<Standing, string>> = { held: '#1f7a4d', awaiting: '#b45309', late: '#b42318', settling: '#5b4bc4', done: '#6b6b6b' }

export function standingOf(booking: Pick<CalendarBooking, 'rentalState' | 'holdState'>): Standing {
  switch (booking.rentalState) {
    case 'overdue':
      return 'late'
    case 'returned':
    case 'inspecting':
    case 'settling':
      return 'settling'
    case 'closed':
      return 'done'
    default:
      return booking.holdState === 'placed' ? 'held' : 'awaiting'
  }
}

export type CalendarResource = { readonly id: string; readonly name: string; readonly type: string }
export type CalendarEvent = {
  readonly id: string
  readonly resourceId: string
  readonly rentalId: string
  readonly startDate: string
  readonly endDate: string
  readonly name: string
  readonly standing: Standing
  readonly simulated: boolean
  readonly cls: string
  readonly eventColor: string
}

export function calendarModel(calendar: ShopCalendar, unknownRenter: string): { readonly resources: readonly CalendarResource[]; readonly events: readonly CalendarEvent[] } {
  return {
    resources: calendar.items.map((item) => ({ id: item.id, name: item.label, type: item.typeName })),
    events: calendar.bookings.map((booking) => {
      const standing = standingOf(booking)
      return {
        id: `${booking.rentalId}:${booking.itemId}`,
        resourceId: booking.itemId,
        rentalId: booking.rentalId,
        startDate: booking.startsAt.toISOString(),
        endDate: booking.endsAt.toISOString(),
        name: booking.renterName ?? unknownRenter,
        standing,
        simulated: booking.simulated,
        cls: `hold-standing-${standing}`,
        eventColor: STANDING_COLORS[standing],
      }
    }),
  }
}

// Where the scheduler opens: where the earliest rental still under way began, so each item out today shows its whole
// bar, or now when nothing is under way. Never before the calendar's first day.
export function openingDate(events: readonly Pick<CalendarEvent, 'startDate' | 'endDate'>[], now: Date, windowFrom: Date): Date {
  const underWay = events.map((event) => ({ start: new Date(event.startDate), end: new Date(event.endDate) })).filter(({ start, end }) => start <= now && end > now)
  const earliest = underWay.reduce((first, { start }) => (start < first ? start : first), now)
  return earliest < windowFrom ? windowFrom : earliest
}
