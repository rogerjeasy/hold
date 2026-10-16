import { describe, expect, it } from 'vitest'
import type { PayPalHolds } from '../port.ts'
import { createPayPalClient } from './client.ts'
import { createRestPayPalHolds } from './holds.ts'
import { stubServer, TOKEN_REPLY } from './stub-server.ts'
import type { StubReply, StubServer } from './stub-server.ts'

function paypalAgainst(replies: readonly StubReply[]): { paypal: PayPalHolds; server: StubServer } {
  const server = stubServer([TOKEN_REPLY, ...replies])
  const client = createPayPalClient({
    environment: 'sandbox',
    credentials: () => Promise.resolve({ clientId: 'stub-client-id', clientSecret: 'stub-client-secret' }),
    fetch: server.fetch,
    sleep: () => Promise.resolve(),
  })
  return { paypal: createRestPayPalHolds(client), server }
}

const URL = 'https://hold.test/api/webhooks/paypal/account-1'
const HEADERS = { transmissionId: 'T-1', transmissionTime: '2026-10-15T09:00:00Z', transmissionSig: 'SIG', certUrl: 'https://api.sandbox.paypal.com/cert', authAlgo: 'SHA256withRSA' }
const EVENT = '{"id":"WH-1","event_type":"CHECKOUT.ORDER.APPROVED","resource":{"id":"ORDER-9"}}'

describe('createWebhook', () => {
  it('subscribes Hold’s address to the events it acts on', async () => {
    const { paypal, server } = paypalAgainst([{ status: 201, body: { id: 'WEBHOOK-1' } }])
    expect(await paypal.createWebhook({ url: URL, eventTypes: ['CHECKOUT.ORDER.APPROVED', 'PAYMENT.CAPTURE.COMPLETED'] })).toEqual({ ok: true, value: { webhookId: 'WEBHOOK-1' } })
    const [call] = server.apiCalls()
    expect(call).toMatchObject({ method: 'POST', path: '/v1/notifications/webhooks', body: { url: URL, event_types: [{ name: 'CHECKOUT.ORDER.APPROVED' }, { name: 'PAYMENT.CAPTURE.COMPLETED' }] } })
  })

  it('finds the subscription PayPal already has for the address, instead of failing', async () => {
    const { paypal } = paypalAgainst([
      { status: 400, body: { name: 'WEBHOOK_URL_ALREADY_EXISTS', details: [{ issue: 'WEBHOOK_URL_ALREADY_EXISTS' }] } },
      { status: 200, body: { webhooks: [{ id: 'OTHER', url: 'https://elsewhere.test' }, { id: 'WEBHOOK-0', url: URL }] } },
    ])
    expect(await paypal.createWebhook({ url: URL, eventTypes: ['CHECKOUT.ORDER.APPROVED'] })).toEqual({ ok: true, value: { webhookId: 'WEBHOOK-0' } })
  })
})

describe('verifyWebhook', () => {
  it('asks PayPal to check the signature against the exact event it sent', async () => {
    const { paypal, server } = paypalAgainst([{ status: 200, body: { verification_status: 'SUCCESS' } }])
    expect(await paypal.verifyWebhook({ webhookId: 'WEBHOOK-1', headers: HEADERS, body: EVENT })).toEqual({ ok: true, value: 'verified' })
    expect(server.apiCalls()[0]?.body).toEqual({
      auth_algo: 'SHA256withRSA',
      cert_url: 'https://api.sandbox.paypal.com/cert',
      transmission_id: 'T-1',
      transmission_sig: 'SIG',
      transmission_time: '2026-10-15T09:00:00Z',
      webhook_id: 'WEBHOOK-1',
      webhook_event: JSON.parse(EVENT) as unknown,
    })
  })

  it('says rejected when PayPal says the signature is not its own', async () => {
    const { paypal } = paypalAgainst([{ status: 200, body: { verification_status: 'FAILURE' } }])
    expect(await paypal.verifyWebhook({ webhookId: 'WEBHOOK-1', headers: HEADERS, body: EVENT })).toEqual({ ok: true, value: 'rejected' })
  })

  it('rejects a body that is not JSON without asking PayPal', async () => {
    const { paypal, server } = paypalAgainst([])
    expect(await paypal.verifyWebhook({ webhookId: 'WEBHOOK-1', headers: HEADERS, body: 'not json' })).toEqual({ ok: true, value: 'rejected' })
    expect(server.apiCalls()).toEqual([])
  })
})
