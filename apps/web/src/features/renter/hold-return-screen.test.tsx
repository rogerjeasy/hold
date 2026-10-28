import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { HoldReturnScreen } from './hold-return-screen'

const confirmHold = vi.fn()
vi.mock('./actions', () => ({ confirmHold: (...args: unknown[]) => confirmHold(...args) as unknown }))
vi.mock('@/i18n/navigation', async (original) => ({ ...(await original<object>()), useRouter: () => ({ refresh: vi.fn() }) }))

describe('coming back from approving the hold', () => {
  it('confirms the hold once, by itself, and says it is placed', async () => {
    confirmHold.mockResolvedValue({ ok: true, value: { state: 'placed' } })
    renderWithIntl(<HoldReturnScreen token="token" orderId="ORDER-7" shopName="Ribeira Bikes" placed={false} />)
    expect(await screen.findByText('Hold placed. Nothing was charged.')).toBeInTheDocument()
    expect(confirmHold).toHaveBeenCalledTimes(1)
    expect((confirmHold.mock.calls[0]?.[1] as FormData).get('orderId')).toBe('ORDER-7')
  })

  // A walk-in's fee is taken from the hold just placed, so the page never says nothing was charged.
  it('says a walk-in’s hold is placed and only their fee is charged', async () => {
    confirmHold.mockReset()
    confirmHold.mockResolvedValue({ ok: true, value: { state: 'placed' } })
    renderWithIntl(<HoldReturnScreen token="token" orderId="ORDER-8" shopName="Ribeira Bikes" placed={false} walkIn />)
    expect(await screen.findByText('Hold placed. Only your fee is charged.')).toBeInTheDocument()
    expect(screen.queryByText(/Nothing was charged/)).not.toBeInTheDocument()
  })

  it('says a declined hold reserved nothing, and offers to approve again', async () => {
    confirmHold.mockReset()
    confirmHold.mockResolvedValue({ ok: false, failure: 'refused', reason: 'declined' })
    renderWithIntl(<HoldReturnScreen token="token" orderId="ORDER-7" shopName="Ribeira Bikes" placed={false} />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('PayPal declined the hold. Nothing was reserved.')
    })
    expect(screen.getByRole('link', { name: 'Approve again' })).toHaveAttribute('href', '/r/token/pay')
  })
})
