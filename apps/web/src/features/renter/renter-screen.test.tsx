import type { RenterView } from '@hold/db'
import { screen, waitFor, within } from '@testing-library/react'
import { EVIDENCE_KEPT_DAYS } from '@hold/domain'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { RenterScreen } from './renter-screen'

vi.mock('./actions', () => ({ payFee: () => Promise.resolve(null), confirmFee: () => Promise.resolve(null), approveHold: () => Promise.resolve(null) }))
vi.mock('@/features/contact/renter-actions', () => ({ sendPhoneCode: vi.fn(), confirmPhone: vi.fn(), chooseEmail: vi.fn(), sendContactChangeCode: vi.fn() }))

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
  paymentKeptUntil: new Date('2026-10-15T09:15:00Z'),
  feeOrderId: null,
  walkIn: false,
}

// PayPal's v6 web SDK, enough to make its button: eligible, with a session that is never started here.
const fakePayPal = () => Object.assign(window, { paypal: { createInstance: () => Promise.resolve({ findEligibleMethods: () => Promise.resolve({ isEligible: () => true }), createPayPalOneTimePaymentSession: () => Promise.resolve({ start: () => Promise.resolve() }) }) } })

describe('the renter’s page', () => {
  it('says until when the booking keeps its items while the fee is unpaid, in the shop’s time', () => {
    renderWithIntl(<RenterScreen token="token" view={view} />)
    expect(screen.getByText('Your items are kept for you until 10:15 AM.')).toBeInTheDocument()
  })

  it('names no deadline once there is none to meet', () => {
    renderWithIntl(<RenterScreen token="token" view={{ ...view, paymentKeptUntil: null }} />)
    expect(screen.queryByText(/kept for you until/)).not.toBeInTheDocument()
  })

  it('says, before the renter pays, that the photographs are kept as evidence and for how long, linking the privacy notice', () => {
    for (const walkIn of [false, true]) {
      const { unmount } = renderWithIntl(<RenterScreen token="t" view={{ ...view, walkIn }} />)
      const notice = screen.getByText(new RegExp(`kept as evidence for ${String(EVIDENCE_KEPT_DAYS)} days, then deleted`))
      expect(within(notice).getByRole('link', { name: 'How Hold handles your details' })).toHaveAttribute('href', '/privacy')
      expect(notice.compareDocumentPosition(screen.getByRole('button', { name: /with PayPal/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      unmount()
    }
  })

  it('says it no more once the fee is paid', () => {
    renderWithIntl(<RenterScreen token="t" view={{ ...view, state: 'booked' }} />)
    expect(screen.queryByText(/kept as evidence for/)).not.toBeInTheDocument()
  })

  it('pays the fee with PayPal’s own button when the shop’s PayPal app is known', async () => {
    fakePayPal()
    const { container } = renderWithIntl(<RenterScreen token="t" view={view} checkout={{ clientId: 'shop-client-id', environment: 'sandbox' }} />)
    await waitFor(() => {
      expect(container.querySelector('paypal-button')).not.toBeNull()
    })
    Reflect.deleteProperty(window, 'paypal')
  })

  it('asks a walk-in to pay the fee and approve the hold together, in one PayPal approval', () => {
    renderWithIntl(<RenterScreen token="t" view={{ ...view, walkIn: true }} />)
    expect(screen.getByRole('button', { name: 'Pay €120.00 and approve the €300.00 hold with PayPal' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pay €120.00 with PayPal' })).not.toBeInTheDocument()
    expect(screen.getByText(/Only the fee is charged/)).toBeInTheDocument()
  })

  it('offers “Something happened” while the renter has the items, through a link that may report', () => {
    renderWithIntl(<RenterScreen token="signed-token" view={{ ...view, state: 'out' }} canReport />)
    expect(screen.getByRole('link', { name: 'Something happened' })).toHaveAttribute('href', '/r/signed-token/incident')
  })
  it('does not offer it before the handover, after the return, or to a link that may not report', () => {
    for (const state of ['booked', 'returned'] as const) {
      const { unmount } = renderWithIntl(<RenterScreen token="t" view={{ ...view, state }} canReport />)
      expect(screen.queryByRole('link', { name: 'Something happened' })).not.toBeInTheDocument()
      unmount()
    }
    renderWithIntl(<RenterScreen token="t" view={{ ...view, state: 'out' }} canReport={false} />)
    expect(screen.queryByRole('link', { name: 'Something happened' })).not.toBeInTheDocument()
  })
  it('links to the rental record through the renter’s own signed token', () => {
    renderWithIntl(<RenterScreen token="signed-token" view={view} />)
    expect(screen.getByRole('link', { name: 'Your rental record' })).toHaveAttribute('href', '/r/signed-token/record')
  })
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

  it('links to the condition report once the rental is out', () => {
    renderWithIntl(<RenterScreen token="token" view={{ ...view, state: 'out' }} />)
    expect(screen.getByText('Your rental is with you.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See how it left' })).toHaveAttribute('href', '/r/token/condition')
  })

  it('links to the renter’s Clean Record, and asks the consent question there once PayPal has named them', () => {
    renderWithIntl(<RenterScreen token="token" view={view} askConsent />)
    expect(screen.getByText('Use my record of clean returns to lower future holds at Hold shops.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Your Clean Record' })).toHaveAttribute('href', '/r/token/trust')
  })

  it('does not ask again once the renter has answered', () => {
    renderWithIntl(<RenterScreen token="token" view={view} />)
    expect(screen.queryByText('Use my record of clean returns to lower future holds at Hold shops.')).not.toBeInTheDocument()
  })
})

describe('how the renter is reached', () => {
  it('asks a renter on their own phone whether they want texts, before anything else they must do', () => {
    renderWithIntl(<RenterScreen token="token" view={view} contact={{ channel: 'email', phone: null, confirmed: false, locked: false, shown: [] }} />)
    const panel = screen.getByRole('region', { name: 'How we reach you' })
    expect(within(panel).getByRole('button', { name: 'Text me instead' })).toBeInTheDocument()
  })
})
