import { addDays } from '@hold/domain'
import type { ShopToday } from '@hold/db'
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { TodayScreen } from './today-screen'

// 10:12 in Lisbon.
const NOW = new Date('2026-10-14T09:12:00Z')
const at = (iso: string) => new Date(iso)

const empty: ShopToday = {
  rentalsOut: 0,
  itemsOut: 0,
  dueBackToday: 0,
  activeHolds: [],
  claimsWaiting: [],
  late: [],
  counter: [],
  month: { feesCents: 0, releasedCents: 0, claimedCents: 0, recoveredCents: 0 },
  routine: { handover: { medianSeconds: null, count: 0 }, return: { medianSeconds: null, count: 0 } },
  activity: [{ at: at('2026-10-14T08:00:00Z'), action: 'shop.created', actorName: 'Tomás', renterName: null, simulated: false }],
  rentals: { total: 0, simulated: 0 },
}

const placed = (daysAgo: number) => {
  const createdAt = addDays(NOW, -daysAgo)
  return { createdAt, assuredUntil: addDays(createdAt, 3), validUntil: addDays(createdAt, 29) }
}

const busy: ShopToday = {
  rentalsOut: 5,
  itemsOut: 7,
  dueBackToday: 3,
  activeHolds: [
    { rentalId: 'r1', renterName: 'Sofia Marques', reservedCents: 600_00, simulated: true, ...placed(1) },
    { rentalId: 'r2', renterName: 'Marco Rossi', reservedCents: 300_00, simulated: true, ...placed(26.5) },
  ],
  claimsWaiting: [
    { claimId: 'c1', rentalId: 'r3', renterName: 'Priya Natarajan', state: 'awaiting_approval', totalCents: 35_00, firstLine: 'Deep scratch on the frame', renterComment: null, simulated: true },
    { claimId: 'c2', rentalId: 'r4', renterName: 'Tom Becker', state: 'contested', totalCents: 45_00, firstLine: 'Lost lock', renterComment: 'The lock was in the bag.', simulated: true },
  ],
  late: [{ rentalId: 'r5', renterName: 'Lea Fischer', endsAt: at('2026-10-13T17:00:00Z'), simulated: true }],
  counter: [
    { rentalId: 'r6', kind: 'handover', at: at('2026-10-14T07:30:00Z'), renterName: 'Lukas Weber', items: ['Hybrid bike 1'], done: true, hold: { reservedCents: 250_00, state: 'placed', assuredUntil: null }, simulated: true },
    { rentalId: 'r1', kind: 'return', at: at('2026-10-14T09:15:00Z'), renterName: 'Sofia Marques', items: ['E-bike 1', 'E-bike 2'], done: false, hold: { reservedCents: 600_00, state: 'placed', assuredUntil: addDays(NOW, 2) }, simulated: true },
    { rentalId: 'r7', kind: 'handover', at: at('2026-10-14T13:00:00Z'), renterName: 'Hannah Svensson', items: ['Gravel bike 1'], done: false, hold: { reservedCents: 300_00, state: 'requested', assuredUntil: null }, simulated: true },
  ],
  month: { feesCents: 488_00, releasedCents: 515_00, claimedCents: 115_00, recoveredCents: 35_00 },
  routine: { handover: { medianSeconds: 48, count: 12 }, return: { medianSeconds: 65, count: 10 } },
  activity: [{ at: at('2026-10-14T07:30:00Z'), action: 'handover.done', actorName: 'Tomás', renterName: 'Lukas Weber', simulated: true }],
  rentals: { total: 11, simulated: 11 },
}

const allDone = { passkey: true, paypal: true, prices: true, items: 3, staff: 2 }

function show(today: ShopToday, options: { setup?: typeof allDone; samples?: 'offer' | 'needs_prices' | 'none' } = {}) {
  return renderWithIntl(
    <TodayScreen
      firstName="Tomás"
      shop={{ name: 'Ribeira Bikes', timeZone: 'Europe/Lisbon', currency: 'EUR' }}
      now={NOW}
      part="morning"
      setup={options.setup ?? allDone}
      today={today}
      samples={options.samples ?? 'none'}
    />,
  )
}

describe('the Today page', () => {
  it('greets the person and says what the day holds', () => {
    show(busy)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good morning, Tomás')
    expect(screen.getByText('4 things need a decision.')).toBeInTheDocument()
    expect(screen.getByText('3 rentals come back today.')).toBeInTheDocument()
  })

  it('gives the day’s figures from the records', () => {
    show(busy)
    const figures = screen.getByRole('region', { name: 'Today in figures' })
    expect(within(figures).getByText('7')).toBeInTheDocument()
    expect(within(figures).getByText('across 5 rentals')).toBeInTheDocument()
    expect(within(figures).getByText('€900.00')).toBeInTheDocument()
    expect(within(figures).getByText('€80.00 in total')).toBeInTheDocument()
  })

  it('lists what needs a decision, most urgent first, quoting the renter as data', () => {
    show(busy)
    const decisions = within(screen.getByRole('region', { name: 'Needs a decision' })).getAllByRole('listitem')
    expect(decisions.map((item) => item.querySelector('h3')?.textContent)).toEqual([
      'Claim of €35.00 for Priya Natarajan',
      expect.stringMatching(/^The hold for Marco Rossi ends /),
      'Lea Fischer is late',
      'Tom Becker contested a claim of €45.00',
    ])
    expect(screen.getByText('Day 27 of 29')).toBeInTheDocument()
    expect(screen.getByText('“The lock was in the bag.”')).toBeInTheDocument()
  })

  it('leads from each decision to the page where it is made', () => {
    show(busy)
    const region = within(screen.getByRole('region', { name: 'Needs a decision' }))
    expect(region.getByRole('link', { name: 'Claim of €35.00 for Priya Natarajan' })).toHaveAttribute('href', '/shop/rentals/r3/claim')
    expect(region.getByRole('link', { name: /^The hold for Marco Rossi ends / })).toHaveAttribute('href', '/shop/rentals/r2')
    expect(region.getByRole('link', { name: 'Lea Fischer is late' })).toHaveAttribute('href', '/shop/rentals/r5')
    expect(region.getByRole('link', { name: 'Tom Becker contested a claim of €45.00' })).toHaveAttribute('href', '/shop/rentals/r4/claim')
  })

  it('leads to the decision board, where everything waiting on a person is in one place', () => {
    show(busy)
    const region = within(screen.getByRole('region', { name: 'Needs a decision' }))
    expect(region.getByRole('link', { name: 'Open the decision board' })).toHaveAttribute('href', '/shop/decisions')
  })

  it('shows the counter in the shop’s time, with what is done and what each hold is doing', () => {
    show(busy)
    const counter = within(screen.getByRole('region', { name: 'Today at the counter' }))
    const rows = counter.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('08:30')
    expect(rows[0]).toHaveTextContent('Done')
    expect(counter.getByText(/^Now 10:12/)).toBeInTheDocument()
    expect(counter.getByText('E-bike 1, E-bike 2')).toBeInTheDocument()
    expect(counter.getByText("Waiting for the renter's approval")).toBeInTheDocument()
  })

  it('counts the holds by where they stand', () => {
    show(busy)
    const holds = within(screen.getByRole('region', { name: 'Holds on PayPal' }))
    expect(holds.getByText('reserved across 2 holds')).toBeInTheDocument()
    expect(holds.getByText('In the first three days').parentElement).toHaveTextContent('1')
    expect(holds.getByText('Ending within three days').parentElement).toHaveTextContent('1')
  })

  it('adds up the month', () => {
    show(busy)
    const month = within(screen.getByRole('region', { name: 'October so far' }))
    expect(month.getByText('€515.00')).toBeInTheDocument()
    expect(month.getByText('€35.00')).toBeInTheDocument()
  })

  // project-description.md section 13: the counter routine is measured, each time with its count, never claimed.
  it('times the month’s handovers and returns, each with its count, and says so when none is timed', () => {
    const { unmount } = show(busy)
    const month = within(screen.getByRole('region', { name: 'October so far' }))
    expect(month.getByText('Handover: 0:48, the median of 12 sessions')).toBeInTheDocument()
    expect(month.getByText('Return: 1:05, the median of 10 sessions')).toBeInTheDocument()
    unmount()
    show(empty)
    expect(within(screen.getByRole('region', { name: 'October so far' })).getByText('Handover and return: not timed yet this month')).toBeInTheDocument()
  })

  it('says plainly that sample rentals are simulated, and marks each one', () => {
    show(busy)
    expect(screen.getByRole('note')).toHaveTextContent('This shop holds sample rentals.')
    expect(screen.getAllByText('Sample').length).toBeGreaterThan(3)
  })

  it('reads calmly on a day with nothing in it', () => {
    show(empty)
    expect(screen.getByText('Nothing needs a decision.')).toBeInTheDocument()
    expect(screen.getByText('No handovers or returns today.')).toBeInTheDocument()
    expect(screen.getByText('No holds on PayPal right now.')).toBeInTheDocument()
    expect(screen.getByText('Shop created')).toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('lists what is left to set up until it is done', () => {
    show(empty, { setup: { passkey: true, paypal: false, prices: false, items: 0, staff: 1 } })
    const steps = screen.getByRole('region', { name: 'Set up your shop' })
    expect(steps).toHaveTextContent('1 of 5 done')
    expect(within(steps).getByRole('link', { name: 'Go to PayPal' })).toHaveAttribute('href', '/shop/paypal')
    expect(within(steps).getByRole('link', { name: 'Go to items' })).toHaveAttribute('href', '/shop/items')
  })

  it('leaves the setup out once everything is done', () => {
    show(empty)
    expect(screen.queryByRole('region', { name: 'Set up your shop' })).not.toBeInTheDocument()
  })

  it('offers sample rentals to an empty shop, or says what they need first', () => {
    const { unmount } = show(empty, { samples: 'offer' })
    expect(screen.getByRole('button', { name: 'Add sample rentals' })).toBeInTheDocument()
    unmount()
    show(empty, { samples: 'needs_prices' })
    expect(screen.queryByRole('button', { name: 'Add sample rentals' })).not.toBeInTheDocument()
    expect(screen.getByText('Publish a price list first. The sample claims use its prices.')).toBeInTheDocument()
  })
})
