import type { RentalHold } from '@hold/db'
import { screen, waitFor, within } from '@testing-library/react'
import { EVIDENCE_KEPT_DAYS } from '@hold/domain'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { HoldScreen } from './hold-screen'

vi.mock('./actions', () => ({ approveHold: () => Promise.resolve(null) }))
vi.mock('@/features/contact/renter-actions', () => ({ sendPhoneCode: vi.fn(), confirmPhone: vi.fn(), chooseEmail: vi.fn(), sendContactChangeCode: vi.fn() }))

const view = { shopName: 'Ribeira Bikes', timeZone: 'Europe/Lisbon', currency: 'EUR', holdCents: 300_00, replyPeriodHours: 48, feeCents: 25_00, state: 'awaiting_hold' as const }
const hold = (overrides: Partial<RentalHold> = {}): RentalHold => ({
  id: 'hold-1',
  state: 'requested',
  strategy: 'at_counter',
  reservedCents: 300_00,
  currency: 'EUR',
  orderId: null,
  paypalAuthorizationId: null,
  assuredUntil: null,
  validUntil: null,
  placementFailure: null,
  ordinaryCents: 300_00,
  trust: null,
  ...overrides,
})

describe('the renter’s hold page', () => {
  it('says, before the renter approves the hold, that the photographs are kept as evidence, linking the privacy notice', () => {
    renderWithIntl(<HoldScreen token="token" view={view} hold={hold()} />)
    const notice = screen.getByText(new RegExp(`kept as evidence for ${String(EVIDENCE_KEPT_DAYS)} days`))
    expect(within(notice).getByRole('link', { name: 'How Hold handles your details' })).toHaveAttribute('href', '/privacy')
  })

  it('approves the hold with PayPal’s own button when the shop’s PayPal app is known', async () => {
    Object.assign(window, { paypal: { createInstance: () => Promise.resolve({ findEligibleMethods: () => Promise.resolve({ isEligible: () => true }), createPayPalOneTimePaymentSession: () => Promise.resolve({ start: () => Promise.resolve() }) }) } })
    const { container } = renderWithIntl(<HoldScreen token="token" view={view} hold={hold()} checkout={{ clientId: 'shop-client-id', environment: 'sandbox' }} />)
    await waitFor(() => {
      expect(container.querySelector('paypal-button')).not.toBeNull()
    })
    Reflect.deleteProperty(window, 'paypal')
  })

  it('explains the hold and offers to approve exactly the agreed amount in PayPal', () => {
    renderWithIntl(<HoldScreen token="token" view={view} hold={hold()} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Approve your hold')
    expect(screen.getByText(/It is not a charge/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve €300.00 with PayPal' })).toBeInTheDocument()
  })

  it('says the shop asks for the hold at pickup, before staff have', () => {
    renderWithIntl(<HoldScreen token="token" view={view} hold={undefined} />)
    expect(screen.getByText('The shop asks for the hold when you collect your items.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('tells the renter a declined hold reserved nothing, and lets them approve again', () => {
    renderWithIntl(<HoldScreen token="token" view={view} hold={hold({ orderId: 'ORDER-1', placementFailure: 'declined' })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('PayPal declined the hold. Nothing was reserved.')
    expect(screen.getByRole('button', { name: 'Approve €300.00 with PayPal' })).toBeInTheDocument()
  })

  it('shows a placed hold, and when it ends', () => {
    renderWithIntl(<HoldScreen token="token" view={view} hold={hold({ state: 'placed', validUntil: new Date('2026-11-14T09:00:00Z') })} />)
    expect(screen.getByRole('status')).toHaveTextContent('Your hold of €300.00 is placed. Nothing was charged.')
    expect(screen.getByText(/Nov 14/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See your rental' })).toHaveAttribute('href', '/r/token')
  })

  it('asks a walk-in who comes here first for the fee and the hold together', () => {
    renderWithIntl(<HoldScreen token="token" view={{ ...view, state: 'pending_payment' }} hold={hold({ strategy: 'combined' })} />)
    expect(screen.getByRole('button', { name: 'Pay €25.00 and approve the €300.00 hold with PayPal' })).toBeInTheDocument()
  })

  // The fee is captured from the hold just after it is placed; the page never says nothing was charged.
  it('says a walk-in’s fee is being taken once the hold is placed, then that only the fee was charged', () => {
    const { unmount } = renderWithIntl(<HoldScreen token="token" view={{ ...view, state: 'pending_payment' }} hold={hold({ state: 'placed', strategy: 'combined' })} />)
    expect(screen.getByRole('status')).toHaveTextContent('Your hold of €300.00 is placed. PayPal is taking your fee of €25.00.')
    unmount()
    renderWithIntl(<HoldScreen token="token" view={{ ...view, state: 'ready' }} hold={hold({ state: 'placed', strategy: 'combined' })} />)
    expect(screen.getByRole('status')).toHaveTextContent('Your fee of €25.00 is paid and your hold of €300.00 is placed. Only the fee was charged.')
  })

  it('asks for a new hold before the placed one ends, and says the old one is released once approved', () => {
    renderWithIntl(<HoldScreen token="token" view={view} hold={hold({ state: 'placed', orderId: 'ORDER-2', validUntil: new Date('2026-11-14T09:00:00Z') })} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Approve a new hold')
    expect(screen.getByText(/Your hold ends on Nov 14/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve €300.00 with PayPal' })).toBeInTheDocument()
  })

  it('says why the hold is lower than the ordinary one, when the shop’s trust ladder lowered it', () => {
    renderWithIntl(<HoldScreen token="token" view={view} hold={hold({ reservedCents: 150_00, trust: { version: 2, rung: 2, cleanReturns: 5, windowMonths: 24 } })} />)
    expect(screen.getByText('Your hold is €150.00, not €300.00, because you have returned 5 rentals in good condition in the last 24 months.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve €150.00 with PayPal' })).toBeInTheDocument()
  })

  it('gives no reason for an ordinary hold', () => {
    renderWithIntl(<HoldScreen token="token" view={view} hold={hold()} />)
    expect(screen.queryByText(/because you have returned/)).not.toBeInTheDocument()
  })
})

describe('how the renter is reached, at the counter', () => {
  it('lets the renter choose texts on their own phone before approving the hold, while the number is still theirs to set', () => {
    renderWithIntl(<HoldScreen token="token" view={view} hold={hold()} contact={{ channel: 'email', phone: null, confirmed: false, locked: false, shown: [] }} />)
    expect(screen.getByRole('region', { name: 'How we reach you' })).toBeInTheDocument()
  })

  it('leaves it off once the hold is placed', () => {
    renderWithIntl(<HoldScreen token="token" view={{ ...view, state: 'ready' }} hold={hold({ state: 'placed' })} contact={{ channel: 'email', phone: null, confirmed: false, locked: true, shown: [] }} />)
    expect(screen.queryByRole('region', { name: 'How we reach you' })).not.toBeInTheDocument()
  })
})
