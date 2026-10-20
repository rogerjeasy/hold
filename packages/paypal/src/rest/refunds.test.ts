import { expect, it } from 'vitest'
import { createRestPayPalHolds } from './holds.ts'
import { createPayPalClient } from './client.ts'
import { stubServer, TOKEN_REPLY } from './stub-server.ts'
it('reads a refund back and binds it to the captured payment', async () => {
  const refund = { id: 'REFUND-1', status: 'COMPLETED', amount: { currency_code: 'EUR', value: '35.00' }, create_time: '2026-10-20T09:00:00Z', links: [{ rel: 'up', href: 'https://api-m.sandbox.paypal.com/v2/payments/captures/CAPTURE-1' }] }
  const server = stubServer([TOKEN_REPLY, { status: 201, body: { id: refund.id } }, { status: 200, body: refund }])
  const paypal = createRestPayPalHolds(createPayPalClient({ environment: 'sandbox', credentials: () => Promise.resolve({ clientId: 'id', clientSecret: 'secret' }), fetch: server.fetch, sleep: () => Promise.resolve() }))
  expect(await paypal.refundCapture({ captureId: 'CAPTURE-1', amount: { cents: 3500, currency: 'EUR' }, idempotencyKey: 'approved-refund-1' })).toMatchObject({ ok: true, value: { refundId: 'REFUND-1', captureId: 'CAPTURE-1', status: 'completed', amount: { cents: 3500, currency: 'EUR' } } })
  expect(server.apiCalls().map((call) => call.path)).toEqual(['/v2/payments/captures/CAPTURE-1/refund', '/v2/payments/refunds/REFUND-1'])
})

it('recovers a known pending refund with a read only, and rejects another capture binding', async () => {
  const refund = { id: 'REFUND-PENDING', status: 'COMPLETED', amount: { currency_code: 'EUR', value: '35.00' }, create_time: '2026-10-20T09:00:00Z', links: [{ rel: 'up', href: 'https://api-m.sandbox.paypal.com/v2/payments/captures/CAPTURE-1' }] }
  const server = stubServer([TOKEN_REPLY, { status: 200, body: refund }, { status: 200, body: refund }])
  const paypal = createRestPayPalHolds(createPayPalClient({ environment: 'sandbox', credentials: () => Promise.resolve({ clientId: 'id', clientSecret: 'secret' }), fetch: server.fetch, sleep: () => Promise.resolve() }))
  expect(await paypal.readRefund('REFUND-PENDING', 'CAPTURE-1')).toMatchObject({ ok: true, value: { refundId: 'REFUND-PENDING', status: 'completed' } })
  expect(await paypal.readRefund('REFUND-PENDING', 'ANOTHER-CAPTURE')).toMatchObject({ ok: false, error: { kind: 'unexpected_response' } })
  expect(server.apiCalls().map((call) => call.method)).toEqual(['GET', 'GET'])
})
