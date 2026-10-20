import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { PaidScreen } from './paid-screen'

const confirmFee = vi.fn()
const refresh = vi.fn()
vi.mock('./actions', () => ({ confirmFee: (...args: unknown[]) => confirmFee(...args) as unknown }))
vi.mock('@/i18n/navigation', async (original) => ({ ...(await original<object>()), useRouter: () => ({ refresh }) }))

afterEach(() => { vi.useRealTimers() })

describe('coming back from PayPal', () => {
  it('confirms the payment once, by itself, and says so', async () => {
    confirmFee.mockResolvedValue({ ok: true, value: { state: 'booked' } })
    renderWithIntl(<PaidScreen token="token" orderId="ORDER-9" shopName="Ribeira Bikes" booked={false} />)
    expect(await screen.findByText('Payment confirmed. Your rental is booked.')).toBeInTheDocument()
    expect(confirmFee).toHaveBeenCalledTimes(1)
    const sent = confirmFee.mock.calls[0]?.[1] as FormData
    expect([sent.get('token'), sent.get('orderId')]).toEqual(['token', 'ORDER-9'])
    expect(screen.getByRole('link', { name: 'See your rental' })).toHaveAttribute('href', '/r/token')
  })

  it('says why when PayPal has not confirmed, and lets the renter try again', async () => {
    confirmFee.mockReset()
    confirmFee.mockResolvedValue({ ok: false, failure: 'refused', reason: 'not_approved' })
    renderWithIntl(<PaidScreen token="token" orderId="ORDER-9" shopName="Ribeira Bikes" booked={false} />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('PayPal has not confirmed your approval yet')
    })
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('waits while the worker captures, looking again until the rental is booked', async () => {
    vi.useFakeTimers()
    confirmFee.mockReset()
    confirmFee.mockResolvedValue({ ok: true, value: { state: 'capturing' } })
    const { rerender } = renderWithIntl(<PaidScreen token="token" orderId="ORDER-9" shopName="Ribeira Bikes" booked={false} />)
    // Commit the asynchronous confirmation and its polling effect before advancing the clock.
    await act(() => Promise.resolve())
    expect(confirmFee).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
    expect(refresh).toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Checking with PayPal')
    rerender(<PaidScreen token="token" orderId="ORDER-9" shopName="Ribeira Bikes" booked />)
    expect(screen.getByText('Payment confirmed. Your rental is booked.')).toBeInTheDocument()
  })

  it('says a rental already booked is booked, without asking again', () => {
    confirmFee.mockReset()
    renderWithIntl(<PaidScreen token="token" orderId="ORDER-9" shopName="Ribeira Bikes" booked />)
    expect(screen.getByText('Payment confirmed. Your rental is booked.')).toBeInTheDocument()
    expect(confirmFee).not.toHaveBeenCalled()
  })
})
