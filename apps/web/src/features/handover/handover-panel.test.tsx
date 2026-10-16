import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { HandoverPanel } from './handover-panel'

const startHandover = vi.fn()
const push = vi.fn()
vi.mock('./actions', () => ({ startHandover: (...args: unknown[]) => startHandover(...args) as unknown }))
vi.mock('@/i18n/navigation', async (original) => ({ ...(await original<object>()), useRouter: () => ({ push, refresh: vi.fn() }) }))

const RENTAL = '00000000-0000-4000-8000-0000000000a3'
const items = [
  { itemId: '00000000-0000-4000-8000-0000000000b1', label: 'City e-bike 1', sessionId: '00000000-0000-4000-8000-0000000000c1', sealed: true },
  { itemId: '00000000-0000-4000-8000-0000000000b2', label: 'City e-bike 2', sessionId: '00000000-0000-4000-8000-0000000000c2', sealed: false },
  { itemId: '00000000-0000-4000-8000-0000000000b3', label: 'City e-bike 3', sessionId: null, sealed: false },
]

describe('the handover, for staff', () => {
  it('shows each item sealed, started or still to photograph', () => {
    renderWithIntl(<HandoverPanel rentalId={RENTAL} handovers={items} />)
    const panel = screen.getByRole('region', { name: 'Handover' })
    expect(panel).toHaveTextContent('City e-bike 1')
    expect(panel).toHaveTextContent('Photographed and sealed')
    expect(screen.getByRole('link', { name: 'Continue City e-bike 2' })).toHaveAttribute('href', `/shop/rentals/${RENTAL}/handover/00000000-0000-4000-8000-0000000000c2`)
    expect(screen.getByRole('button', { name: 'Photograph City e-bike 3' })).toBeInTheDocument()
  })

  it('starts an item’s handover and opens its photographs', async () => {
    startHandover.mockResolvedValue({ ok: true, value: { sessionId: 'new-session' } })
    renderWithIntl(<HandoverPanel rentalId={RENTAL} handovers={items} />)
    await userEvent.click(screen.getByRole('button', { name: 'Photograph City e-bike 3' }))
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/shop/rentals/${RENTAL}/handover/new-session`)
    })
    expect((startHandover.mock.calls[0]?.[1] as FormData).get('itemId')).toBe(items[2]?.itemId)
  })
})
