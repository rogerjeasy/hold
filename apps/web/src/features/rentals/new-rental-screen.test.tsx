import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { NewRentalScreen } from './new-rental-screen'
import type { NewRentalScreenProps } from './new-rental-screen'

vi.mock('./actions', () => ({ bookRental: () => Promise.resolve(null) }))
vi.mock('@/i18n/navigation', async (original) => ({ ...(await original<object>()), useRouter: () => ({ push: () => undefined }) }))

const types = [{ id: 'type-ebike', name: 'City e-bike', category: 'e_bike' as const, currency: 'EUR', dayRateCents: 40_00, holdCents: 300_00, available: 3 }]
const props: NewRentalScreenProps = {
  shopName: 'Ribeira Bikes',
  currency: 'EUR',
  period: { from: '2026-10-16T10:00', to: '2026-10-19T10:00', days: 3, invalid: false, period: { startsAt: new Date('2026-10-16T09:00:00Z'), endsAt: new Date('2026-10-19T09:00:00Z') } },
  types,
  ready: 'ready',
}

describe('a new rental', () => {
  it('asks when, then what is free then, then for whom', () => {
    renderWithIntl(<NewRentalScreen {...props} />)
    expect(screen.getByLabelText('Pick up')).toHaveValue('2026-10-16T10:00')
    expect(screen.getByRole('button', { name: 'One more City e-bike' })).toBeEnabled()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Book' })).toBeInTheDocument()
  })

  it('sends the dates it shows with the booking', () => {
    const { container } = renderWithIntl(<NewRentalScreen {...props} />)
    expect(container.querySelector('input[name="startsAt"]')).toHaveValue('2026-10-16T10:00')
    expect(container.querySelector('input[name="endsAt"]')).toHaveValue('2026-10-19T10:00')
  })

  // architecture.md section 8.2: staff choose one approval for a walk-in, off by default so a Clean Record can apply.
  it('offers a walk-in one approval of the fee and the hold, off by default, for a rental that starts today', () => {
    const { unmount } = renderWithIntl(<NewRentalScreen {...props} startsToday />)
    const walkIn = screen.getByRole('checkbox', { name: /Walk-in: fee and hold in one PayPal approval/ })
    expect(walkIn).not.toBeChecked()
    expect(walkIn).toHaveAttribute('name', 'walkIn')
    unmount()
    renderWithIntl(<NewRentalScreen {...props} />)
    expect(screen.queryByRole('checkbox', { name: /Walk-in/ })).not.toBeInTheDocument()
  })

  it('says what to set up first', () => {
    const { unmount } = renderWithIntl(<NewRentalScreen {...props} ready="needs_paypal" />)
    expect(screen.getByRole('link', { name: 'Go to PayPal' })).toHaveAttribute('href', '/shop/paypal')
    unmount()
    renderWithIntl(<NewRentalScreen {...props} ready="needs_items" types={[]} />)
    expect(screen.getByRole('link', { name: 'Go to items' })).toHaveAttribute('href', '/shop/items')
  })

  it('offers nothing to book for dates that cannot be booked', () => {
    renderWithIntl(<NewRentalScreen {...props} period={{ ...props.period, invalid: true, period: undefined }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Bring back after picking up')
    expect(screen.queryByRole('button', { name: 'Book' })).not.toBeInTheDocument()
  })
})
