import { describe, expect, it } from 'vitest'
import type { PayPalHolds } from '../port.ts'
import { createPayPalClient } from './client.ts'
import { createRestPayPalHolds } from './holds.ts'
import { stubServer, TOKEN_REPLY } from './stub-server.ts'
import type { StubReply, StubServer } from './stub-server.ts'

const DEPOSIT = { cents: 150_00, currency: 'EUR' }
const AUTHORIZATION = {
  id: 'AUTH-1',
  status: 'CREATED',
  amount: { currency_code: 'EUR', value: '150.00' },
  create_time: '2026-10-17T09:00:00Z',
  expiration_time: '2026-11-15T09:00:00Z',
}

function holdsAgainst(replies: readonly StubReply[]): { holds: PayPalHolds; server: StubServer } {
  const server = stubServer([TOKEN_REPLY, ...replies])
  const client = createPayPalClient({
    environment: 'sandbox',
    credentials: () => Promise.resolve({ clientId: 'stub-client-id', clientSecret: 'stub-client-secret' }),
    fetch: server.fetch,
    sleep: () => Promise.resolve(),
  })
  return { holds: createRestPayPalHolds(client), server }
}

describe('createHoldOrder', () => {
  const input = {
    amount: DEPOSIT,
    rentalReference: 'rental-1',
    description: 'Refundable hold for one e-bike',
    brandName: 'Ribeira Bikes',
    returnUrl: 'https://hold.test/approved',
    cancelUrl: 'https://hold.test/cancelled',
    idempotencyKey: 'execution-1',
  }

  it('creates an authorize-first order for the hold amount and returns where the renter approves it', async () => {
    const { holds, server } = holdsAgainst([
      {
        status: 200,
        body: {
          id: 'ORDER-1',
          status: 'PAYER_ACTION_REQUIRED',
          links: [
            { href: 'https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER-1', rel: 'self' },
            { href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1', rel: 'payer-action' },
          ],
        },
      },
    ])

    const order = await holds.createHoldOrder(input)

    expect(order).toEqual({
      ok: true,
      value: {
        orderId: 'ORDER-1',
        status: 'awaiting_approval',
        approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1',
        payerId: undefined,
      },
    })
    const [call] = server.apiCalls()
    expect(call).toMatchObject({ method: 'POST', path: '/v2/checkout/orders' })
    expect(call?.body).toMatchObject({
      intent: 'AUTHORIZE',
      purchase_units: [{ custom_id: 'rental-1', amount: { currency_code: 'EUR', value: '150.00' } }],
      payment_source: { paypal: { experience_context: { brand_name: 'Ribeira Bikes' } } },
    })
  })

  // PayPal shows the brand name on its own pages in place of the sandbox account's "Test Store", and takes at most 127
  // characters of it.
  it('names the shop on PayPal\'s pages, cut to the 127 characters PayPal takes', async () => {
    const { holds, server } = holdsAgainst([{ status: 200, body: { id: 'ORDER-2', status: 'PAYER_ACTION_REQUIRED', links: [] } }])
    await holds.createHoldOrder({ ...input, brandName: `  ${'B'.repeat(130)}  ` })
    const [call] = server.apiCalls()
    expect(call?.body).toMatchObject({ payment_source: { paypal: { experience_context: { brand_name: 'B'.repeat(127) } } } })
  })

  // A walk-in's one order is how Hold learns who the renter is, as no fee order names them (architecture.md section 8.2).
  it('reads an approved order with who approved it and no approval link', async () => {
    const { holds } = holdsAgainst([
      {
        status: 200,
        body: {
          id: 'ORDER-1',
          status: 'APPROVED',
          payer: { payer_id: 'PAYER123', email_address: 'priya@example.com', name: { given_name: 'Priya', surname: 'Natarajan' } },
          links: [{ href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1', rel: 'payer-action' }],
        },
      },
    ])

    expect(await holds.readHoldOrder('ORDER-1')).toEqual({
      ok: true,
      value: { orderId: 'ORDER-1', status: 'approved', approvalUrl: undefined, payer: { payerId: 'PAYER123', email: 'priya@example.com', name: 'Priya Natarajan' } },
    })
  })

  it('names no payer for an order that does not say who approved it', async () => {
    const { holds } = holdsAgainst([{ status: 200, body: { id: 'ORDER-1', status: 'APPROVED', payer: { payer_id: 'PAYER123' } } }])

    expect(await holds.readHoldOrder('ORDER-1')).toMatchObject({ ok: true, value: { payer: undefined } })
  })
})

describe('placeHold', () => {
  it('authorizes the order, then reads the authorization back from PayPal', async () => {
    const { holds, server } = holdsAgainst([
      { status: 201, body: { id: 'ORDER-1', status: 'COMPLETED', purchase_units: [{ payments: { authorizations: [{ id: 'AUTH-1' }] } }] } },
      { status: 200, body: AUTHORIZATION },
    ])

    const hold = await holds.placeHold({ orderId: 'ORDER-1', idempotencyKey: 'execution-2' })

    expect(hold).toEqual({
      ok: true,
      value: {
        authorizationId: 'AUTH-1',
        status: 'created',
        amount: DEPOSIT,
        createdAt: new Date('2026-10-17T09:00:00Z'),
        expiresAt: new Date('2026-11-15T09:00:00Z'),
      },
    })
    expect(server.apiCalls().map((call) => `${call.method} ${call.path}`)).toEqual([
      'POST /v2/checkout/orders/ORDER-1/authorize',
      'GET /v2/payments/authorizations/AUTH-1',
    ])
  })

  it('reports an order the renter has not approved', async () => {
    const { holds } = holdsAgainst([{ status: 422, body: { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_NOT_APPROVED' }] } }])

    expect(await holds.placeHold({ orderId: 'ORDER-1', idempotencyKey: 'execution-2' })).toMatchObject({
      ok: false,
      error: { kind: 'order_not_approved' },
    })
  })

  it('treats a reply with no authorization as unreadable, and reads nothing further', async () => {
    const { holds, server } = holdsAgainst([{ status: 201, body: { id: 'ORDER-1', status: 'COMPLETED', purchase_units: [] }, debugId: 'debug-1' }])

    expect(await holds.placeHold({ orderId: 'ORDER-1', idempotencyKey: 'execution-2' })).toMatchObject({
      ok: false,
      error: { kind: 'unexpected_response', debugId: 'debug-1' },
    })
    expect(server.apiCalls()).toHaveLength(1)
  })
})

describe('renewHold', () => {
  it('reauthorizes and returns the new authorization', async () => {
    const renewed = { ...AUTHORIZATION, id: 'AUTH-2', create_time: '2026-10-21T09:00:00Z' }
    const { holds, server } = holdsAgainst([
      { status: 201, body: { id: 'AUTH-2', status: 'CREATED' } },
      { status: 200, body: renewed },
    ])

    const hold = await holds.renewHold({ authorizationId: 'AUTH-1', idempotencyKey: 'execution-3' })

    expect(hold).toMatchObject({ ok: true, value: { authorizationId: 'AUTH-2', createdAt: new Date('2026-10-21T09:00:00Z') } })
    expect(server.apiCalls().map((call) => `${call.method} ${call.path}`)).toEqual([
      'POST /v2/payments/authorizations/AUTH-1/reauthorize',
      'GET /v2/payments/authorizations/AUTH-2',
    ])
  })
})

describe('renewHold with an amount', () => {
  // PayPal's sandbox, 28 October 2026: a renewal sent with no amount asks for the original amount, which PayPal refuses
  // once part of the hold was captured, as a walk-in's fee is (tech-stack.md section 16, item 3).
  it('asks PayPal to renew only what is still held, when an amount is given', async () => {
    const { holds, server } = holdsAgainst([
      { status: 201, body: { id: 'AUTH-2', status: 'CREATED' } },
      { status: 200, body: { ...AUTHORIZATION, id: 'AUTH-2' } },
    ])

    await holds.renewHold({ authorizationId: 'AUTH-1', amount: { cents: 150_00, currency: 'EUR' }, idempotencyKey: 'execution-4' })

    expect(server.apiCalls()[0]).toMatchObject({ method: 'POST', path: '/v2/payments/authorizations/AUTH-1/reauthorize', body: { amount: { currency_code: 'EUR', value: '150.00' } } })
  })
})

describe('readAuthorization', () => {
  it('reads an authorization PayPal let expire as expired, not as an answer it cannot read', async () => {
    const { holds } = holdsAgainst([{ status: 200, body: { ...AUTHORIZATION, status: 'EXPIRED' } }])

    expect(await holds.readAuthorization('AUTH-1')).toMatchObject({ ok: true, value: { authorizationId: 'AUTH-1', status: 'expired' } })
  })
})

describe('releaseHold', () => {
  it('voids the authorization, then reads it back', async () => {
    const { holds, server } = holdsAgainst([{ status: 204 }, { status: 200, body: { ...AUTHORIZATION, status: 'VOIDED' } }])

    const hold = await holds.releaseHold({ authorizationId: 'AUTH-1', idempotencyKey: 'execution-4' })

    expect(hold).toMatchObject({ ok: true, value: { authorizationId: 'AUTH-1', status: 'voided' } })
    expect(server.apiCalls()[0]).toMatchObject({ method: 'POST', path: '/v2/payments/authorizations/AUTH-1/void' })
  })
})

describe('captureFromHold', () => {
  const input = { authorizationId: 'AUTH-1', amount: { cents: 40_00, currency: 'EUR' }, finalCapture: true, idempotencyKey: 'execution-5' }
  const capture = {
    id: 'CAPTURE-1',
    status: 'COMPLETED',
    amount: { currency_code: 'EUR', value: '40.00' },
    final_capture: true,
    create_time: '2026-10-19T16:30:00Z',
  }

  it('captures the amount in cents as a decimal string and says whether it is final', async () => {
    const { holds, server } = holdsAgainst([{ status: 201, body: capture }])

    const result = await holds.captureFromHold(input)

    expect(result).toEqual({
      ok: true,
      value: {
        captureId: 'CAPTURE-1',
        status: 'completed',
        amount: { cents: 40_00, currency: 'EUR' },
        finalCapture: true,
        createdAt: new Date('2026-10-19T16:30:00Z'),
      },
    })
    expect(server.apiCalls()[0]?.body).toEqual({ amount: { currency_code: 'EUR', value: '40.00' }, final_capture: true })
  })

  it('reports a capture PayPal did not complete with its status, not as a success to assume', async () => {
    const { holds } = holdsAgainst([{ status: 201, body: { ...capture, status: 'PENDING' } }])

    expect(await holds.captureFromHold(input)).toMatchObject({ ok: true, value: { status: 'pending' } })
  })

  it.each([
    ['an amount that is not a decimal', { ...capture, amount: { currency_code: 'EUR', value: 'forty' } }],
    ['a status Hold does not know', { ...capture, status: 'SETTLED' }],
    ['no body at all', undefined],
  ])('treats %s as unreadable', async (_name, body) => {
    const { holds } = holdsAgainst([{ status: 201, ...(body === undefined ? {} : { body }) }])

    expect(await holds.captureFromHold(input)).toMatchObject({ ok: false, error: { kind: 'unexpected_response' } })
  })
})

describe('readCapture', () => {
  it('reads the captured resource independently, including its authorization binding', async () => {
    const { holds, server } = holdsAgainst([{ status: 200, body: { id: 'CAP-READ', status: 'COMPLETED', amount: { currency_code: 'EUR', value: '35.00' }, final_capture: true, create_time: '2026-10-20T09:00:00Z', supplementary_data: { related_ids: { authorization_id: 'AUTH-1' } } } }])
    expect(await holds.readCapture('CAP-READ')).toMatchObject({ ok: true, value: { captureId: 'CAP-READ', authorizationId: 'AUTH-1', amount: { cents: 3500, currency: 'EUR' } } })
    expect(server.apiCalls()[0]?.path).toBe('/v2/payments/captures/CAP-READ')
  })

  it('reads a capture PayPal took back, as after a chargeback, as reversed', async () => {
    const { holds } = holdsAgainst([{ status: 200, body: { id: 'CAP-REVERSED', status: 'REVERSED', amount: { currency_code: 'EUR', value: '35.00' }, final_capture: true, create_time: '2026-10-20T09:00:00Z', supplementary_data: { related_ids: { authorization_id: 'AUTH-1' } } } }])
    expect(await holds.readCapture('CAP-REVERSED')).toMatchObject({ ok: true, value: { captureId: 'CAP-REVERSED', status: 'reversed' } })
  })
})
