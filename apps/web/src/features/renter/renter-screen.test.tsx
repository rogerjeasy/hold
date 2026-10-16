import type { RenterView } from '@hold/db'
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { RenterScreen } from './renter-screen'

vi.mock('./actions', () => ({ payFee: () => Promise.resolve(null), confirmFee: () => Promise.resolve(null) }))

const view: RenterView = {
  rentalId: 'rental-1',
  shopName: 'Ribeira Bikes',
  timeZone: 'Europe/Lisbon',
  state: 'pending_payment',
  startsAt: new Date('2026-10-16T09:00:00Z'),
  endsAt: new Date('2026-10-19T09:00:00Z'),
  days: 3,
  currency: 'EUR',
  feeCents: 120_00,
  holdCents: 300_00,
  lines: [{ name: 'City e-bike', count: 1, dayRateCents: 40_00, holdCents: 300_00 }],
  prices: [
    { description: 'Scratched frame', category: 'damage', amountCents: 35_00 },
    { description: 'Missing charger', category: 'loss', amountCents: 60_00 },
  ],
  wearPolicy: 'Light scuffs on the tyres are ordinary wear.',
  replyPeriodHours: 72,
  renterName: null,
  simulated: false,
  paymentLapsed: false,
  feeOrderId: null,
}

describe('the renter’s page', () => {
  it('keeps the fee and the hold apart, and says the hold is not a charge', () => {
    renderWithIntl(<RenterScreen token="token" view={view} />)
    const amounts = screen.getByRole('region', { name: 'Two amounts, kept apart' })
    expect(within(amounts).getByText('€120.00')).toBeInTheDocument()
    expect(within(amounts).getByText('€300.00')).toBeInTheDocument()
    expect(amounts).toHaveTextContent('This is not a charge')
    expect(amounts).toHaveTextContent('72 hours')
  })

  it('shows what is rented, the damage prices and the wear policy before paying', () => {
    renderWithIntl(<RenterScreen token="token" view={view} />)
    expect(screen.getByText('1 × City e-bike')).toBeInTheDocument()
    const prices = screen.getByRole('region', { name: "The shop's damage prices" })
    expect(prices).toHaveTextContent('Scratched frame')
    expect(prices).toHaveTextContent('€35.00')
    expect(screen.getByText('Light scuffs on the tyres are ordinary wear.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay €120.00 with PayPal' })).toBeInTheDocument()
  })

  it('says the fee is paid, and what comes next', () => {
    renderWithIntl(<RenterScreen token="token" view={{ ...view, state: 'booked', renterName: 'Priya Natarajan' }} />)
    expect(screen.getByText('Booked. Your fee is paid.')).toBeInTheDocument()
    expect(screen.getByText(/at pickup, you approve the hold/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Pay/ })).not.toBeInTheDocument()
  })

  it('says plainly when a booking was let go', () => {
    renderWithIntl(<RenterScreen token="token" view={{ ...view, state: 'abandoned' }} />)
    expect(screen.getByText(/This booking was let go/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Pay/ })).not.toBeInTheDocument()
  })

  it('sends the renter to approve the hold once the shop asks for it at pickup', () => {
    renderWithIntl(<RenterScreen token="token" view={{ ...view, state: 'awaiting_hold' }} />)
    expect(screen.getByText('The shop is ready for your hold.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Approve the hold' })).toHaveAttribute('href', '/r/token/pay')
  })

  it('says the items can be collected once the hold is placed', () => {
    renderWithIntl(<RenterScreen token="token" view={{ ...view, state: 'ready' }} />)
    expect(screen.getByText('Your hold is placed. You can collect your items.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Approve the hold' })).not.toBeInTheDocument()
  })
})
