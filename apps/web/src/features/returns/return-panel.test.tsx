import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { ReturnPanel } from './return-panel'

const startReturn = vi.fn()
const push = vi.fn()
vi.mock('./actions', () => ({ startReturn: (...args: unknown[]) => startReturn(...args) as unknown }))
vi.mock('@/i18n/navigation', async (original) => ({ ...(await original<object>()), useRouter: () => ({ push, refresh: vi.fn() }) }))

const RENTAL = '00000000-0000-4000-8000-0000000000a3'
const ITEM = '00000000-0000-4000-8000-0000000000b3'

describe('the return, for staff', () => {
  it('starts an item’s return, opens its photographs, and says so while the next page loads', async () => {
    startReturn.mockResolvedValue({ ok: true, value: { sessionId: 'new-session' } })
    const { rerender } = renderWithIntl(<ReturnPanel rentalId={RENTAL} returns={[{ itemId: ITEM, label: 'City bike 1', sessionId: null, sealed: false, comparisonId: null }]} canAct />)
    await userEvent.click(screen.getByRole('button', { name: 'Start return for City bike 1' }))
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/shop/rentals/${RENTAL}/return/new-session`)
    })
    // The page refreshes with the started return before the next page arrives: it says it is opening, not "Continue".
    rerender(<ReturnPanel rentalId={RENTAL} returns={[{ itemId: ITEM, label: 'City bike 1', sessionId: 'new-session', sealed: false, comparisonId: null }]} canAct />)
    expect(screen.getByRole('status')).toHaveTextContent('Opening the return photographs…')
    expect(screen.queryByRole('link', { name: 'Continue return for City bike 1' })).not.toBeInTheDocument()
  })
})
