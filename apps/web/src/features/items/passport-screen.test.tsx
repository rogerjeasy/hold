import type { ItemPassport } from '@hold/db'
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { ebikeType, items } from './fixtures'
import { PassportScreen } from './passport-screen'

vi.mock('./actions', () => ({ editItem: () => Promise.resolve(null), changeItemStatus: () => Promise.resolve(null) }))

const clock = { timeZone: 'Europe/Lisbon', currency: 'EUR' }

const passport: ItemPassport = {
  item: items.out,
  type: ebikeType,
  rentals: [
    {
      id: 'r1',
      state: 'out',
      startsAt: new Date('2026-10-14T08:00:00Z'),
      endsAt: new Date('2026-10-16T16:00:00Z'),
      renterName: 'Priya Natarajan',
      simulated: false,
      claim: undefined,
    },
    {
      id: 'r0',
      state: 'closed',
      startsAt: new Date('2026-10-01T08:00:00Z'),
      endsAt: new Date('2026-10-02T16:00:00Z'),
      renterName: null,
      simulated: true,
      claim: { state: 'charged', totalCents: 35_00, currency: 'EUR' },
    },
  ],
  marks: [],
  sessions: [],
}

describe('the item passport', () => {
  it('names the item, its type and where it is', () => {
    renderWithIntl(<PassportScreen shopName="Ribeira Bikes" clock={clock} passport={passport} role="owner" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('City e-bike 2')
    expect(screen.getByText('Item passport')).toBeInTheDocument()
    expect(screen.getAllByText('Out').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'All items' })).toHaveAttribute('href', '/shop/items')
  })

  it('lists its rentals, newest first, with a sample marked and a claim named', () => {
    renderWithIntl(<PassportScreen shopName="Ribeira Bikes" clock={clock} passport={passport} role="owner" />)
    const rentals = within(screen.getByRole('region', { name: 'Rentals' })).getAllByRole('listitem')
    expect(rentals[0]).toHaveTextContent('Priya Natarajan')
    expect(rentals[1]).toHaveTextContent('Renter not known yet')
    expect(rentals[1]).toHaveTextContent('Sample')
    expect(rentals[1]).toHaveTextContent('Claim of €35.00')
  })

  it('says plainly that no marks or photographs are recorded yet', () => {
    renderWithIntl(<PassportScreen shopName="Ribeira Bikes" clock={clock} passport={passport} role="owner" />)
    expect(within(screen.getByRole('region', { name: 'Known marks' })).getByText(/No marks recorded/)).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Photo sessions' })).getByText(/No photographs yet/)).toBeInTheDocument()
  })

  it('shows the photo plan the item is photographed to', () => {
    renderWithIntl(<PassportScreen shopName="Ribeira Bikes" clock={clock} passport={passport} role="owner" />)
    const plan = within(screen.getByRole('region', { name: 'Photo plan' })).getAllByRole('listitem')
    expect(plan.map((view) => view.textContent)).toEqual([expect.stringContaining('Frame, left side'), expect.stringContaining('Optional')])
  })

  it('lets counter staff send it to repair, but not retire it or change its details', () => {
    renderWithIntl(<PassportScreen shopName="Ribeira Bikes" clock={clock} passport={{ ...passport, item: items.available }} role="counter_staff" />)
    expect(screen.getByRole('button', { name: 'Send to repair' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retire this item' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save details' })).not.toBeInTheDocument()
  })

  it('offers an item in repair its way back, with the note that sent it there', () => {
    renderWithIntl(<PassportScreen shopName="Ribeira Bikes" clock={clock} passport={{ ...passport, item: items.repair }} role="manager" />)
    expect(screen.getByRole('button', { name: 'Back in service' })).toBeInTheDocument()
    expect(screen.getByText('Brake pads')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retire this item' })).toBeInTheDocument()
  })

  it('offers nothing to change on a retired item, or to a read-only member', () => {
    const { unmount } = renderWithIntl(<PassportScreen shopName="Ribeira Bikes" clock={clock} passport={{ ...passport, item: items.retired }} role="owner" />)
    expect(screen.queryByRole('button', { name: 'Back in service' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send to repair' })).not.toBeInTheDocument()
    unmount()
    renderWithIntl(<PassportScreen shopName="Ribeira Bikes" clock={clock} passport={{ ...passport, item: items.available }} role="read_only" />)
    expect(screen.queryByRole('button', { name: 'Send to repair' })).not.toBeInTheDocument()
    expect(screen.getByText("Only staff can change an item's status.")).toBeInTheDocument()
  })
})
