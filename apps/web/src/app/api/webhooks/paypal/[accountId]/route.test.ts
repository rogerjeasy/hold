// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

const received = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })))
vi.mock('@/server/paypal-webhook', () => ({ PAYPAL_EVENT_MAX_BYTES: 64 * 1024, receivePayPalEvent: received }))

const { POST } = await import('./route')
const params = Promise.resolve({ accountId: 'account-1' })

describe('the PayPal webhook route', () => {
  it('hands a delivery within the limit to the intake', async () => {
    const response = await POST(new Request('https://hold.test/api/webhooks/paypal/account-1', { method: 'POST', body: '{"id":"WH-1"}' }), { params })
    expect(response.status).toBe(200)
    expect(received).toHaveBeenCalledWith('account-1', '{"id":"WH-1"}', expect.any(Headers))
  })

  it('refuses a delivery over 64 KB before the intake sees it', async () => {
    received.mockClear()
    const response = await POST(new Request('https://hold.test/api/webhooks/paypal/account-1', { method: 'POST', body: 'x'.repeat(64 * 1024 + 1) }), { params })
    expect(response.status).toBe(413)
    expect(received).not.toHaveBeenCalled()
  })
})
