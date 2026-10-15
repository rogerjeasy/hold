import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { BookingLines } from './booking-lines'

const types = [
  { id: 'type-ebike', name: 'City e-bike', category: 'e_bike' as const, currency: 'EUR', dayRateCents: 40_00, holdCents: 300_00, available: 2 },
  { id: 'type-seat', name: 'Child seat', category: 'other' as const, currency: 'EUR', dayRateCents: 8_00, holdCents: 50_00, available: 0 },
]

describe('choosing what to book', () => {
  it('counts up to what is free, and prices the booking as it goes', () => {
    const { container } = renderWithIntl(<BookingLines types={types} currency="EUR" days={3} />)
    const more = screen.getByRole('button', { name: 'One more City e-bike' })
    fireEvent.click(more)
    fireEvent.click(more)
    expect(more).toBeDisabled()
    expect(screen.getByRole('status', { name: 'Number of City e-bike' })).toHaveTextContent('2')
    const totals = screen.getByRole('region', { name: 'This booking' })
    expect(within(totals).getByText('3 days')).toBeInTheDocument()
    expect(within(totals).getByText('€240.00')).toBeInTheDocument()
    expect(within(totals).getByText('€600.00')).toBeInTheDocument()
    const sent = [...container.querySelectorAll<HTMLInputElement>('input[type="hidden"]')].map((input) => `${input.name}=${input.value}`)
    expect(sent).toEqual(['itemTypeId=type-ebike', 'count=2'])
  })

  it('offers nothing that is not free, and says so', () => {
    renderWithIntl(<BookingLines types={types} currency="EUR" days={1} />)
    expect(screen.getByRole('button', { name: 'One more Child seat' })).toBeDisabled()
    expect(screen.getByText('None free')).toBeInTheDocument()
  })

  it('counts back down to none', () => {
    renderWithIntl(<BookingLines types={types} currency="EUR" days={1} />)
    const fewer = screen.getByRole('button', { name: 'One fewer City e-bike' })
    expect(fewer).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'One more City e-bike' }))
    fireEvent.click(fewer)
    expect(screen.getByRole('status', { name: 'Number of City e-bike' })).toHaveTextContent('0')
  })
})
