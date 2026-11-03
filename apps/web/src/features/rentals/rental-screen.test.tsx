import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { detail } from './fixtures'
import { RentalScreen } from './rental-screen'

vi.mock('./actions', () => ({ showRenterLink: () => Promise.resolve(null), sendRenterLinkAgain: () => Promise.resolve(null), letGoOfBooking: () => Promise.resolve(null), askForHold: () => Promise.resolve(null) }))
vi.mock('@/features/returns/actions', () => ({ startReturn: vi.fn() }))
vi.mock('@/features/erasure/actions', () => ({ eraseRenter: vi.fn() }))
vi.mock('@/i18n/navigation', async (original) => ({ ...(await original<object>()), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

const clock = { timeZone: 'Europe/Lisbon', currency: 'EUR' }

const walkInHold = { id: 'hold', state: 'requested' as const, strategy: 'combined' as const, reservedCents: 300_00, currency: 'EUR', orderId: null, paypalAuthorizationId: null, assuredUntil: null, validUntil: null, placementFailure: null, ordinaryCents: 300_00, trust: null }

describe('erasing the renter’s personal details', () => {
  const ERASE = 'Erase the renter’s personal details'

  it('is offered to the owner once the rental has ended, and not before', () => {
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail({ state: 'closed' })} hold={undefined} handovers={[]} canAct canErase />)
    expect(screen.getByRole('region', { name: ERASE })).toBeInTheDocument()
  })

  it('is not offered while the rental is open, nor to anyone but the owner', () => {
    const { unmount } = renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail({ state: 'settling' })} hold={undefined} handovers={[]} canAct canErase />)
    expect(screen.queryByRole('region', { name: ERASE })).not.toBeInTheDocument()
    unmount()
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail({ state: 'closed' })} hold={undefined} handovers={[]} canAct />)
    expect(screen.queryByRole('region', { name: ERASE })).not.toBeInTheDocument()
  })

  it('names an erased renter as such, not by the marker left in their place', () => {
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail({ state: 'closed', who: '[erased]', contactName: '[erased]', contactEmail: '[erased]', renterErasedAt: new Date('2026-11-20T10:00:00Z') })} hold={undefined} handovers={[]} canAct />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Personal details erased')
    expect(screen.queryByText(/\[erased\]/)).not.toBeInTheDocument()
  })
})

describe('a rental', () => {
  it('tells staff a walk-in approves the fee and the hold together, and asks for no hold at pickup', () => {
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail()} hold={walkInHold} handovers={[]} canAct />)
    expect(screen.getByText(/A walk-in: the renter approves the fee and the hold together/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ask for the hold' })).not.toBeInTheDocument()
  })

  it('says when the link was not emailed because the day’s emails are spent, and offers it to show instead', () => {
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail({ contactEmail: 'priya@example.com' })} hold={undefined} handovers={[]} canAct linkHeld />)
    expect(screen.getByText('The link was not emailed')).toBeInTheDocument()
    expect(screen.getByText(/Today’s emails are used for this renter or this shop/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show the link' })).toBeInTheDocument()
  })

  it('offers to text the link to a renter who chose texts, showing only enough of the number to recognise it', () => {
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail({ contactChannel: 'text', contactPhone: '+41 ••• •• 67', contactEmail: 'priya@example.com' })} hold={undefined} handovers={[]} canAct />)
    expect(screen.getByRole('button', { name: 'Text it to +41 ••• •• 67' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Email it to/ })).not.toBeInTheDocument()
  })

  it('shows staff each text sent to the renter and what became of it, number masked', () => {
    const texts = [
      { id: 't2', purpose: 'renter_code' as const, toPhone: '+41 ••• •• 67', status: 'failed' as const, failure: 'unavailable', createdAt: new Date('2026-10-16T10:05:00Z'), statusAt: null },
      { id: 't1', purpose: 'renter_link' as const, toPhone: '+41 ••• •• 67', status: 'delivered' as const, failure: null, createdAt: new Date('2026-10-16T10:00:00Z'), statusAt: new Date('2026-10-16T10:00:04Z') },
    ]
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail({ contactChannel: 'text', contactPhone: '+41 ••• •• 67' })} hold={undefined} handovers={[]} texts={texts} canAct />)
    const panel = screen.getByRole('region', { name: 'Texts to the renter' })
    const rows = within(panel).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('A one-time code')
    expect(rows[0]).toHaveTextContent('Not sent, so Hold used email where it could')
    expect(rows[1]).toHaveTextContent('The renter’s link')
    expect(rows[1]).toHaveTextContent('Delivered')
  })

  it('shows even read-only staff the PayPal record, with PayPal’s ids and the PayPal-Request-Id', () => {
    const paypal = { simulated: false, lines: [{ kind: 'hold_placed' as const, action: 'authorize' as const, currency: 'EUR', amountCents: 300_00, ids: { authorization: 'AUTH-77' }, paypalStatus: 'CREATED', finalCapture: null, requestId: 'hold-placement-1', callState: 'confirmed' as const, at: new Date('2026-10-16T10:00:00Z'), readBackAt: new Date('2026-10-16T10:00:04Z'), event: null, authorizationState: 'created' as const }] }
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail()} hold={undefined} handovers={[]} paypal={paypal} canAct={false} />)
    const panel = screen.getByRole('region', { name: 'PayPal record' })
    expect(panel).toHaveTextContent('AUTH-77')
    expect(panel).toHaveTextContent('hold-placement-1')
  })

  it('links even read-only staff to the rental record', () => {
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail()} hold={undefined} handovers={[]} canAct={false} />)
    expect(screen.getByRole('link', { name: 'Your rental record' })).toHaveAttribute('href', `/shop/rentals/${detail().id}/record`)
  })
  it('links a returned rental to claim review and settlement', () => {
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail({ state: 'returned' })} hold={undefined} handovers={[]} canAct />)
    expect(screen.getByRole('link', { name: 'Claim and settlement' })).toHaveAttribute('href', `/shop/rentals/${detail().id}/claim`)
  })
  it('offers a return inspection when an item is out', () => {
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail({ state: 'out' })} hold={undefined} handovers={[]} returns={[{ itemId: 'bike', label: 'City e-bike', sessionId: null, sealed: false, comparisonId: null }]} canAct />)
    expect(screen.getByRole('button', { name: 'Start return for City e-bike' })).toBeInTheDocument()
  })
  it('leads from a sample rental to its comparison, and offers nothing to photograph', () => {
    const returns = [{ itemId: 'bike', label: 'Hybrid bike 3', sessionId: 'session', sealed: true, comparisonId: 'comparison' }]
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail({ state: 'settling', simulated: true })} hold={undefined} handovers={[]} returns={returns} canAct />)
    expect(screen.getByRole('link', { name: 'Review comparison' })).toHaveAttribute('href', `/shop/rentals/${detail().id}/comparison/comparison`)
    expect(screen.queryByRole('button', { name: /Start return/ })).not.toBeInTheDocument()
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
    const placed = { id: 'hold-1', state: 'placed', strategy: 'at_counter', reservedCents: 300_00, currency: 'EUR', orderId: null, paypalAuthorizationId: 'AUTH-1', assuredUntil: new Date('2026-10-19T09:00:00Z'), validUntil: new Date('2026-11-14T09:00:00Z'), placementFailure: null, ordinaryCents: 300_00, trust: null } as const
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail({ state: 'ready' })} hold={placed} handovers={[]} canAct={false} />)
    expect(screen.getByRole('region', { name: 'Hold at pickup' })).toHaveTextContent('Ready for handover.')
    expect(screen.queryByRole('button', { name: 'Ask for the hold' })).not.toBeInTheDocument()
  })
})
