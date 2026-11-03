import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { PayPalButton } from './paypal-button'

const started = { ok: true as const, value: { approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1', orderId: 'ORDER-1', returnUrl: 'https://hold.test/r/token/paid?token=ORDER-1' } }
const texts = { go: 'Pay €120.00 with PayPal', going: 'Opening PayPal…', agree: 'You agree to the damage prices.' }

type Callbacks = { onApprove: (data: { orderId: string }) => Promise<void>; onCancel: () => void; onError: (error: Error) => void }

// PayPal's v6 web SDK as its reference shows it: an instance from a client ID, eligibility, and a one-time payment
// session whose start takes a promise of { orderId }.
function fakeSdk(outcome: 'approve' | 'cancel' | 'error') {
  const created: { clientId?: string; components?: string[]; locale?: string }[] = []
  const paypal = {
    createInstance: (options: { clientId: string; components: string[]; locale: string }) => {
      created.push(options)
      return Promise.resolve({
        findEligibleMethods: () => Promise.resolve({ isEligible: (method: string) => method === 'paypal' }),
        createPayPalOneTimePaymentSession: (callbacks: Callbacks) =>
          Promise.resolve({
            start: async (_options: { presentationMode: string }, order: Promise<{ orderId: string }>) => {
              const { orderId } = await order
              if (outcome === 'approve') await callbacks.onApprove({ orderId })
              else if (outcome === 'cancel') callbacks.onCancel()
              else callbacks.onError(new Error('INSTRUMENT_DECLINED'))
            },
          }),
      })
    },
  }
  Object.assign(window, { paypal })
  return created
}

afterEach(() => {
  Reflect.deleteProperty(window, 'paypal')
})

describe('the button that takes the renter to PayPal', () => {
  it('shows PayPal’s own button when the shop’s PayPal is known, and returns to Hold once the renter approves', async () => {
    const created = fakeSdk('approve')
    const start = vi.fn(() => Promise.resolve(started))
    const navigate = vi.fn()
    const { container } = renderWithIntl(<PayPalButton token="token" start={start} texts={texts} checkout={{ clientId: 'shop-client-id', environment: 'sandbox' }} navigate={navigate} />)

    await waitFor(() => {
      expect(container.querySelector('paypal-button')).not.toBeNull()
    })
    // PayPal's button and its window speak the page's language, not one PayPal guesses from where the renter is.
    expect(created).toEqual([{ clientId: 'shop-client-id', components: ['paypal-payments'], locale: 'en-GB' }])
    fireEvent.click(container.querySelector('paypal-button') as Element)

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(started.value.returnUrl)
    })
    // No amount is sent: the server reads the fee from the rental.
    expect((start.mock.calls[0] as unknown as [unknown, FormData])[1].get('token')).toBe('token')
  })

  it('asks PayPal for the page’s own language on a French page', async () => {
    const created = fakeSdk('approve')
    const fr = (await import('../../../messages/fr.json')).default
    const { container } = renderWithIntl(<PayPalButton token="token" start={vi.fn(() => Promise.resolve(started))} texts={texts} checkout={{ clientId: 'shop-client-id', environment: 'sandbox' }} navigate={vi.fn()} />, { locale: 'fr', messages: fr })
    await waitFor(() => {
      expect(container.querySelector('paypal-button')).not.toBeNull()
    })
    expect(created[0]?.locale).toBe('fr-FR')
  })

  it('says so when the renter closes PayPal without approving, and changes nothing', async () => {
    fakeSdk('cancel')
    const navigate = vi.fn()
    const { container } = renderWithIntl(<PayPalButton token="token" start={() => Promise.resolve(started)} texts={texts} checkout={{ clientId: 'shop-client-id', environment: 'sandbox' }} navigate={navigate} />)
    await waitFor(() => {
      expect(container.querySelector('paypal-button')).not.toBeNull()
    })
    fireEvent.click(container.querySelector('paypal-button') as Element)
    expect(await screen.findByRole('status')).toHaveTextContent('You closed PayPal before approving. Nothing was charged.')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('falls back to PayPal’s own page when the button cannot finish', async () => {
    fakeSdk('error')
    const navigate = vi.fn()
    const { container } = renderWithIntl(<PayPalButton token="token" start={() => Promise.resolve(started)} texts={texts} checkout={{ clientId: 'shop-client-id', environment: 'sandbox' }} navigate={navigate} />)
    await waitFor(() => {
      expect(container.querySelector('paypal-button')).not.toBeNull()
    })
    fireEvent.click(container.querySelector('paypal-button') as Element)
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(started.value.approvalUrl)
    })
  })

  it('sends the renter to PayPal’s page when the shop’s PayPal is not known', async () => {
    const navigate = vi.fn()
    const { container } = renderWithIntl(<PayPalButton token="token" start={() => Promise.resolve(started)} texts={texts} navigate={navigate} />)
    expect(container.querySelector('paypal-button')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Pay €120.00 with PayPal' }))
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(started.value.approvalUrl)
    })
  })
})
