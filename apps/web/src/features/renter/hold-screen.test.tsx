import type { RentalHold } from '@hold/db'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { HoldScreen } from './hold-screen'

vi.mock('./actions', () => ({ approveHold: () => Promise.resolve(null) }))

const view = { shopName: 'Ribeira Bikes', timeZone: 'Europe/Lisbon', currency: 'EUR', holdCents: 300_00, replyPeriodHours: 48 }
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
  ...overrides,
})

describe('the renter’s hold page', () => {
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

  it('asks for a new hold before the placed one ends, and says the old one is released once approved', () => {
    renderWithIntl(<HoldScreen token="token" view={view} hold={hold({ state: 'placed', orderId: 'ORDER-2', validUntil: new Date('2026-11-14T09:00:00Z') })} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Approve a new hold')
    expect(screen.getByText(/Your hold ends on Nov 14/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve €300.00 with PayPal' })).toBeInTheDocument()
  })
})

