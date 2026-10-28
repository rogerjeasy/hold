import type { ShopCalendar } from '@hold/db'
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { CalendarScreen } from './calendar-screen'

// The scheduler draws on a canvas of its own in the browser; here it is a stand-in that shows what it was given.
vi.mock('./rental-scheduler', () => ({
  RentalScheduler: ({ events }: { events: readonly { name: string }[] }) => <div data-testid="scheduler">{events.map((event) => event.name).join(', ')}</div>,
}))

const clock = { timeZone: 'Europe/Lisbon', currency: 'EUR' }
const window = { from: new Date('2026-10-07T00:00:00Z'), to: new Date('2026-11-04T00:00:00Z') }
const calendar: ShopCalendar = {
  items: [
    { id: 'item-1', label: 'City bike 1', typeName: 'City bike', simulated: false },
    { id: 'item-2', label: 'E-bike 1', typeName: 'E-bike', simulated: true },
  ],
  bookings: [
    { rentalId: 'rental-1', itemId: 'item-1', startsAt: new Date('2026-10-14T09:00:00Z'), endsAt: new Date('2026-10-16T17:00:00Z'), renterName: 'Priya Natarajan', rentalState: 'out', holdState: 'placed', simulated: false },
    { rentalId: 'rental-2', itemId: 'item-2', startsAt: new Date('2026-10-12T09:00:00Z'), endsAt: new Date('2026-10-13T17:00:00Z'), renterName: 'Lea Fischer', rentalState: 'overdue', holdState: 'placed', simulated: true },
  ],
}

describe('the shop’s calendar', () => {
  it('draws every rental on its item, and says in words what each mark means', () => {
    renderWithIntl(<CalendarScreen shopName="Ribeira Bikes" clock={clock} window={window} calendar={calendar} />)
    expect(screen.getByTestId('scheduler')).toHaveTextContent('Priya Natarajan, Lea Fischer')
    const legend = screen.getByRole('list', { name: 'What each mark means' })
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Held on PayPal', 'Waiting for the renter in PayPal', 'Late', 'Being settled', 'Done'])
  })

  it('lists each item’s rentals on a phone, each leading to its rental, with samples marked', () => {
    renderWithIntl(<CalendarScreen shopName="Ribeira Bikes" clock={clock} window={window} calendar={calendar} />)
    const list = screen.getByRole('list', { name: 'Rentals by item' })
    expect(within(list).getByRole('link', { name: /Priya Natarajan/ })).toHaveAttribute('href', '/shop/rentals/rental-1')
    const lea = within(list).getByRole('link', { name: /Lea Fischer/ })
    expect(lea).toHaveTextContent('Late')
    expect(lea).toHaveTextContent('Sample')
  })

  it('says so when nothing is booked in the weeks shown', () => {
    renderWithIntl(<CalendarScreen shopName="Ribeira Bikes" clock={clock} window={window} calendar={{ items: calendar.items, bookings: [] }} />)
    expect(screen.getByText('Nothing is booked in these weeks.')).toBeInTheDocument()
  })

  it('asks for items first in a shop that has none', () => {
    renderWithIntl(<CalendarScreen shopName="Ribeira Bikes" clock={clock} window={window} calendar={{ items: [], bookings: [] }} />)
    expect(screen.getByRole('link', { name: 'Go to items' })).toHaveAttribute('href', '/shop/items')
  })
})
