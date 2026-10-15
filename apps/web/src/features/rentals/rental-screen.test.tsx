import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { detail } from './fixtures'
import { RentalScreen } from './rental-screen'

vi.mock('./actions', () => ({ showRenterLink: () => Promise.resolve(null), emailRenterLinkAgain: () => Promise.resolve(null), letGoOfBooking: () => Promise.resolve(null) }))

const clock = { timeZone: 'Europe/Lisbon', currency: 'EUR' }

describe('a rental', () => {
  it('shows its terms: when, what, the fee and the hold, and the price list agreed to', () => {
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail()} canAct />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Priya Natarajan')
    const terms = screen.getByRole('region', { name: 'Terms' })
    expect(terms).toHaveTextContent('City e-bike 1')
    expect(terms).toHaveTextContent('€120.00')
    expect(terms).toHaveTextContent('€300.00')
    expect(terms).toHaveTextContent('Version 2')
  })

  it('shows how far it has come', () => {
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail({ state: 'booked', renterName: 'Priya N.' })} canAct />)
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
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail()} canAct />)
    expect(screen.getByRole('button', { name: 'Show the link' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Email it to priya@example.com' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Let go of this booking' })).toBeInTheDocument()
  })

  it('does not offer letting go once the fee is paid', () => {
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail({ state: 'booked' })} canAct />)
    expect(screen.queryByRole('button', { name: 'Let go of this booking' })).not.toBeInTheDocument()
  })

  it('offers nothing to change to a read-only member', () => {
    renderWithIntl(<RentalScreen shopName="Ribeira Bikes" clock={clock} rental={detail()} canAct={false} />)
    expect(screen.queryByRole('button', { name: 'Show the link' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Let go of this booking' })).not.toBeInTheDocument()
  })
})
