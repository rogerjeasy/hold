import { describe, expect, it } from 'vitest'
import type { PayPalHolds } from '../port.ts'
import { createPayPalClient } from './client.ts'
import { createRestPayPalHolds } from './holds.ts'
import { stubServer, TOKEN_REPLY } from './stub-server.ts'
import type { StubReply, StubServer } from './stub-server.ts'

const FEE = { cents: 120_00, currency: 'EUR' }

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

// An order PayPal shows once its fee was captured: the payer, and the one capture.
const COMPLETED_ORDER = {
  id: 'ORDER-9',
  status: 'COMPLETED',
  payer: { payer_id: 'PAYER123', email_address: 'priya@example.com', name: { given_name: 'Priya', surname: 'Natarajan' } },
  purchase_units: [
    {
      payments: {
        captures: [{ id: 'CAPTURE-9', status: 'COMPLETED', amount: { currency_code: 'EUR', value: '120.00' }, final_capture: true, create_time: '2026-10-15T09:00:00Z' }],
      },
    },
  ],
}

const PAYMENT = {
  orderId: 'ORDER-9',
  captureId: 'CAPTURE-9',
  status: 'completed',
  amount: FEE,
  payer: { payerId: 'PAYER123', email: 'priya@example.com', name: 'Priya Natarajan' },
}

describe('createFeeOrder', () => {
  it('creates an order to capture the fee and returns where the renter approves it', async () => {
    const { paypal, server } = paypalAgainst([
      { status: 200, body: { id: 'ORDER-9', status: 'PAYER_ACTION_REQUIRED', links: [{ href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-9', rel: 'payer-action' }] } },
    ])
    const order = await paypal.createFeeOrder({
      amount: FEE,
      rentalReference: 'rental-1',
      description: 'Rental fee: 1 × City e-bike, 3 days',
      returnUrl: 'https://hold.test/r/token/paid',
      cancelUrl: 'https://hold.test/r/token',
      idempotencyKey: 'fee-order-rental-1-1',
    })
    expect(order).toEqual({ ok: true, value: { orderId: 'ORDER-9', status: 'awaiting_approval', approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-9', payerId: undefined } })
    const [call] = server.apiCalls()
    expect(call).toMatchObject({ method: 'POST', path: '/v2/checkout/orders' })
    expect(call?.headers.get('PayPal-Request-Id')).toBe('fee-order-rental-1-1')
    expect(call?.body).toMatchObject({
      intent: 'CAPTURE',
      purchase_units: [{ custom_id: 'rental-1', amount: { currency_code: 'EUR', value: '120.00' } }],
      payment_source: { paypal: { experience_context: { shipping_preference: 'NO_SHIPPING', return_url: 'https://hold.test/r/token/paid' } } },
    })
  })
})

describe('captureFeeOrder', () => {
  it('captures with the key, then reads the order back from PayPal', async () => {
    const { paypal, server } = paypalAgainst([
      { status: 201, body: { id: 'ORDER-9', status: 'COMPLETED' } },
      { status: 200, body: COMPLETED_ORDER },
    ])
    expect(await paypal.captureFeeOrder({ orderId: 'ORDER-9', idempotencyKey: 'execution-1' })).toEqual({ ok: true, value: PAYMENT })
    expect(server.apiCalls().map((call) => [call.method, call.path, call.headers.get('PayPal-Request-Id')])).toEqual([
      ['POST', '/v2/checkout/orders/ORDER-9/capture', 'execution-1'],
      ['GET', '/v2/checkout/orders/ORDER-9', null],
    ])
  })

  it('reads an order captured already, instead of failing', async () => {
    const { paypal } = paypalAgainst([
      { status: 422, body: { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] } },
      { status: 200, body: COMPLETED_ORDER },
    ])
    expect(await paypal.captureFeeOrder({ orderId: 'ORDER-9', idempotencyKey: 'execution-2' })).toEqual({ ok: true, value: PAYMENT })
  })

  it('says when the renter has not approved the order', async () => {
    const { paypal } = paypalAgainst([{ status: 422, body: { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_NOT_APPROVED' }] } }])
    const captured = await paypal.captureFeeOrder({ orderId: 'ORDER-9', idempotencyKey: 'execution-3' })
    expect(captured).toMatchObject({ ok: false, error: { kind: 'order_not_approved' } })
  })
})

describe('readFeePayment', () => {
  it('says an order with no capture is not paid', async () => {
    const { paypal } = paypalAgainst([{ status: 200, body: { id: 'ORDER-9', status: 'APPROVED', payer: { payer_id: 'PAYER123' } } }])
    expect(await paypal.readFeePayment('ORDER-9')).toMatchObject({ ok: false, error: { kind: 'not_paid' } })
  })
})
