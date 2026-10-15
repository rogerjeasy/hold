import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { PaidScreen } from './paid-screen'

const confirmFee = vi.fn()
vi.mock('./actions', () => ({ confirmFee: (...args: unknown[]) => confirmFee(...args) as unknown }))

describe('coming back from PayPal', () => {
  it('confirms the payment once, by itself, and says so', async () => {
    confirmFee.mockResolvedValue({ ok: true, value: { state: 'booked' } })
    renderWithIntl(<PaidScreen token="token" orderId="ORDER-9" shopName="Ribeira Bikes" />)
    expect(await screen.findByText('Payment confirmed. Your rental is booked.')).toBeInTheDocument()
    expect(confirmFee).toHaveBeenCalledTimes(1)
    const sent = confirmFee.mock.calls[0]?.[1] as FormData
    expect([sent.get('token'), sent.get('orderId')]).toEqual(['token', 'ORDER-9'])
    expect(screen.getByRole('link', { name: 'See your rental' })).toHaveAttribute('href', '/r/token')
  })

  it('says why when PayPal has not confirmed, and lets the renter try again', async () => {
    confirmFee.mockReset()
    confirmFee.mockResolvedValue({ ok: false, failure: 'refused', reason: 'not_approved' })
    renderWithIntl(<PaidScreen token="token" orderId="ORDER-9" shopName="Ribeira Bikes" />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('PayPal has not confirmed your approval yet')
    })
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
