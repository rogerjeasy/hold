import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import type { ExtensionData } from '@/server/extension-page'
import { RenterExtendScreen } from './renter-extend-screen'

vi.mock('./renter-actions', () => ({ askExtension: vi.fn(), payExtension: vi.fn(), confirmExtension: vi.fn() }))

// Lisbon is UTC+0 in November: the e-bike is due back at 18:00 on Wednesday 4 November.
const endsAt = new Date('2026-11-04T18:00:00Z')
const data: ExtensionData = {
  shopName: 'Ribeira Bikes',
  timeZone: 'Europe/Lisbon',
  currency: 'EUR',
  state: 'out',
  simulated: false,
  canAct: true,
  endsAt,
  suggestedEnd: '2026-11-05T18:00',
  maxDays: 7,
  latestEnd: new Date('2026-11-26T09:00:00Z'),
  holdCents: 300_00,
  quote: null,
  extensions: [],
  checkout: undefined,
}
const show = (overrides: Partial<ExtensionData> = {}) => renderWithIntl(<RenterExtendScreen token="t" data={{ ...data, ...overrides }} />)

describe('keeping the item longer from the renter’s phone', () => {
  it('says when it is due back and how far the hold reaches, and offers a day more in a tap', async () => {
    show()
    expect(screen.getByTestId('due-back')).toHaveTextContent('Wednesday, November 4, 06:00 PM')
    expect(screen.getByText(/Your hold covers a return up to Thursday, November 26, 09:00 AM, and the shop allows up to 7 more days\./)).toBeInTheDocument()
    const time = screen.getByLabelText('New return time')
    expect(time).toHaveValue('2026-11-05T18:00')
    await userEvent.click(screen.getByRole('button', { name: '+3 days' }))
    expect(time).toHaveValue('2026-11-07T18:00')
    expect(screen.getByRole('button', { name: '+3 days' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'See the price' })).toBeInTheDocument()
  })

  it('offers no more quick days than the shop allows', () => {
    show({ maxDays: 2 })
    expect(screen.getByRole('button', { name: '+2 days' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+3 days' })).not.toBeInTheDocument()
  })

  it('shows Hold’s price and the new end, and says the hold stays as it is', () => {
    show({ quote: { extraDays: 2, feeCents: 90_00, endsAt: new Date('2026-11-06T18:00:00Z') } })
    expect(screen.getByTestId('extension-fee')).toHaveTextContent('€90.00')
    expect(screen.getByText('2 more days')).toBeInTheDocument()
    expect(screen.getByText('Friday, November 6, 06:00 PM')).toBeInTheDocument()
    expect(screen.getByText('Paid now with PayPal, on its own. Your €300.00 hold stays exactly as it is.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay €90.00 with PayPal' })).toBeInTheDocument()
  })

  it('lists what was paid, and says plainly when PayPal refused', () => {
    show({ extensions: [{ id: 'a', orderId: 'o1', extraDays: 1, amountCents: 45_00, toEndsAt: new Date('2026-11-05T18:00:00Z'), state: 'paid' }, { id: 'b', orderId: 'o2', extraDays: 2, amountCents: 90_00, toEndsAt: new Date('2026-11-07T18:00:00Z'), state: 'failed' }] })
    expect(screen.getByText('1 more day, to Thursday, November 5, 06:00 PM. €45.00 paid.')).toBeInTheDocument()
    expect(screen.getByText(/PayPal refused the payment, so your return time did not change\./)).toBeInTheDocument()
  })

  it('offers nothing to change once the item is back, or where the shop takes no extensions', () => {
    show({ state: 'returned' })
    expect(screen.queryByRole('button', { name: 'See the price' })).not.toBeInTheDocument()
    expect(screen.getByText('Extensions are for a rental you have with you')).toBeInTheDocument()
    show({ maxDays: 0 })
    expect(screen.getByText('This shop does not take extensions from the phone')).toBeInTheDocument()
  })
})
