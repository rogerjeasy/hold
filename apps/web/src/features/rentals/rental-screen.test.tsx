import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { detail } from './fixtures'
import { RentalScreen } from './rental-screen'

vi.mock('./actions', () => ({ showRenterLink: () => Promise.resolve(null), emailRenterLinkAgain: () => Promise.resolve(null), letGoOfBooking: () => Promise.resolve(null), askForHold: () => Promise.resolve(null) }))
vi.mock('@/features/returns/actions', () => ({ startReturn: vi.fn() }))
vi.mock('@/i18n/navigation', async (original) => ({ ...(await original<object>()), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

const clock = { timeZone: 'Europe/Lisbon', currency: 'EUR' }

describe('a rental', () => {
  it('links a returned rental to claim review and settlement', () => {
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail({ state: 'returned' })} hold={undefined} handovers={[]} canAct />)
    expect(screen.getByRole('link', { name: 'Claim and settlement' })).toHaveAttribute('href', `/shop/rentals/${detail().id}/claim`)
  })
  it('offers a return inspection when an item is out', () => {
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail({ state: 'out' })} hold={undefined} handovers={[]} returns={[{ itemId: 'bike', label: 'City e-bike', sessionId: null, sealed: false, comparisonId: null }]} canAct />)
    expect(screen.getByRole('button', { name: 'Start return for City e-bike' })).toBeInTheDocument()
  })
  it('shows its terms: when, what, the fee and the hold, and the price list agreed to', () => {
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail()} hold={undefined} handovers={[]} canAct />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Priya Natarajan')
    const terms = screen.getByRole('region', { name: 'Terms' })
    expect(terms).toHaveTextContent('City e-bike 1')
    expect(terms).toHaveTextContent('€120.00')
    expect(terms).toHaveTextContent('€300.00')
    expect(terms).toHaveTextContent('Version 2')
  })

  it('shows how far it has come', () => {
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail({ state: 'booked', renterName: 'Priya N.' })} hold={undefined} handovers={[]} canAct />)
    const steps = within(screen.getByRole('region', { name: 'Progress' })).getAllByRole('listitem')
    expect(steps.map((step) => step.textContent)).toEqual([
      expect.stringContaining('Done'),
      expect.stringContaining('Done'),
      expect.stringContaining('Not yet'),
      expect.stringContaining('Not yet'),
      expect.stringContaining('Not yet'),
      expect.stringContaining('Not yet'),
    ])
  })

  it('offers the renter’s link, and letting go while the fee is unpaid', () => {
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail()} hold={undefined} handovers={[]} canAct />)
    expect(screen.getByRole('button', { name: 'Show the link' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Email it to priya@example.com' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Let go of this booking' })).toBeInTheDocument()
  })

  it('does not offer letting go once the fee is paid', () => {
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail({ state: 'booked' })} hold={undefined} handovers={[]} canAct />)
    expect(screen.queryByRole('button', { name: 'Let go of this booking' })).not.toBeInTheDocument()
  })

  it('offers nothing to change to a read-only member', () => {
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail()} hold={undefined} handovers={[]} canAct={false} />)
    expect(screen.queryByRole('button', { name: 'Show the link' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Let go of this booking' })).not.toBeInTheDocument()
  })

  it('offers to ask for the hold once the fee is paid, and not before', () => {
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail()} hold={undefined} handovers={[]} canAct />)
    expect(screen.queryByRole('button', { name: 'Ask for the hold' })).not.toBeInTheDocument()
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail({ state: 'booked' })} hold={undefined} handovers={[]} canAct />)
    expect(screen.getByRole('button', { name: 'Ask for the hold' })).toBeInTheDocument()
  })

  it('shows a placed hold to everyone, and offers a read-only member nothing to do with it', () => {
    const placed = { id: 'hold-1', state: 'placed', strategy: 'at_counter', reservedCents: 300_00, currency: 'EUR', orderId: null, paypalAuthorizationId: 'AUTH-1', assuredUntil: new Date('2026-10-19T09:00:00Z'), validUntil: new Date('2026-11-14T09:00:00Z'), placementFailure: null } as const
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail({ state: 'ready' })} hold={placed} handovers={[]} canAct={false} />)
    expect(screen.getByRole('region', { name: 'Hold at pickup' })).toHaveTextContent('Ready for handover.')
    expect(screen.queryByRole('button', { name: 'Ask for the hold' })).not.toBeInTheDocument()
  })
})
