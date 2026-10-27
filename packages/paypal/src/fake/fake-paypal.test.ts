import { addDays } from '@hold/domain'
import type { Money } from '@hold/domain'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Authorization, PayPalResult } from '../port.ts'
import { createFakePayPal } from './fake-paypal.ts'
import type { FakePayPal } from './fake-paypal.ts'

const PLACED_AT = new Date('2026-10-17T09:00:00Z')
const DEPOSIT: Money = { cents: 150_00, currency: 'EUR' }

let now: Date
let paypal: FakePayPal
let nextKey = 0

function key(): string {
  nextKey += 1
  return `key-${String(nextKey)}`
}

function onDay(day: number): void {
  now = addDays(PLACED_AT, day)
}

function valueOf<Value>(result: PayPalResult<Value>): Value {
  if (!result.ok) throw new Error(`Expected success, got ${result.error.kind}.`)
  return result.value
}

async function kindOf(result: Promise<PayPalResult<unknown>>): Promise<string> {
  const settled = await result
  return settled.ok ? 'ok' : settled.error.kind
}

async function placeHold(amount: Money = DEPOSIT): Promise<Authorization> {
  const order = valueOf(
    await paypal.createHoldOrder({
      amount,
      rentalReference: 'rental-1',
      description: 'Refundable hold',
      returnUrl: 'https://hold.test/approved',
      cancelUrl: 'https://hold.test/cancelled',
      idempotencyKey: key(),
    }),
  )
  paypal.approveOrder(order.orderId)
  return valueOf(await paypal.placeHold({ orderId: order.orderId, idempotencyKey: key() }))
}

function capture(authorizationId: string, cents: number, finalCapture: boolean) {
  return paypal.captureFromHold({ authorizationId, amount: { cents, currency: 'EUR' }, finalCapture, idempotencyKey: key() })
}

beforeEach(() => {
  now = PLACED_AT
  paypal = createFakePayPal({ now: () => now })
})

describe('placing a hold', () => {
  it('needs the renter to approve first', async () => {
    const order = valueOf(
      await paypal.createHoldOrder({
        amount: DEPOSIT,
        rentalReference: 'rental-1',
        description: 'Refundable hold',
        returnUrl: 'https://hold.test/approved',
        cancelUrl: 'https://hold.test/cancelled',
        idempotencyKey: key(),
      }),
    )

    expect(order.status).toBe('awaiting_approval')
    expect(order.approvalUrl).toBeDefined()
    expect(await kindOf(paypal.placeHold({ orderId: order.orderId, idempotencyKey: key() }))).toBe('order_not_approved')
  })

  it('reserves the amount for 29 days', async () => {
    const hold = await placeHold()

    expect(hold).toMatchObject({ status: 'created', amount: DEPOSIT, createdAt: PLACED_AT })
    expect(hold.expiresAt).toEqual(addDays(PLACED_AT, 29))
  })

  it('places one hold when the same request is sent twice', async () => {
    const order = valueOf(
      await paypal.createHoldOrder({
        amount: DEPOSIT,
        rentalReference: 'rental-1',
        description: 'Refundable hold',
        returnUrl: 'https://hold.test/approved',
        cancelUrl: 'https://hold.test/cancelled',
        idempotencyKey: key(),
      }),
    )
    paypal.approveOrder(order.orderId)
    const sameKey = key()

    const first = valueOf(await paypal.placeHold({ orderId: order.orderId, idempotencyKey: sameKey }))
    const second = valueOf(await paypal.placeHold({ orderId: order.orderId, idempotencyKey: sameKey }))

    expect(second.authorizationId).toBe(first.authorizationId)
  })

  it('declines a hold the renter’s funding source refuses, and reserves nothing', async () => {
    const order = valueOf(
      await paypal.createHoldOrder({
        amount: DEPOSIT,
        rentalReference: 'rental-1',
        description: 'Refundable hold',
        returnUrl: 'https://hold.test/approved',
        cancelUrl: 'https://hold.test/cancelled',
        idempotencyKey: key(),
      }),
    )
    paypal.approveOrder(order.orderId)
    paypal.declineFunding(order.orderId)

    expect(await kindOf(paypal.placeHold({ orderId: order.orderId, idempotencyKey: key() }))).toBe('declined')
    expect(valueOf(await paypal.readHoldOrder(order.orderId)).status).toBe('approved')
  })
})

describe('renewing a hold', () => {
  it('is refused inside the three-day assured period', async () => {
    const hold = await placeHold()
    onDay(2.9)

    expect(await kindOf(paypal.renewHold({ authorizationId: hold.authorizationId, idempotencyKey: key() }))).toBe('renewal_too_soon')
  })

  it('gives a new identifier once the assured period has passed', async () => {
    const hold = await placeHold()
    onDay(3)

    const renewed = valueOf(await paypal.renewHold({ authorizationId: hold.authorizationId, idempotencyKey: key() }))

    expect(renewed.authorizationId).not.toBe(hold.authorizationId)
    expect(renewed).toMatchObject({ status: 'created', amount: DEPOSIT, createdAt: now })
  })

  it('does not extend the 29 days', async () => {
    const hold = await placeHold()
    onDay(20)

    const renewed = valueOf(await paypal.renewHold({ authorizationId: hold.authorizationId, idempotencyKey: key() }))

    expect(renewed.expiresAt).toEqual(hold.expiresAt)
  })

  it('refuses a capture or a release that still uses the old identifier', async () => {
    const hold = await placeHold()
    onDay(5)
    const renewed = valueOf(await paypal.renewHold({ authorizationId: hold.authorizationId, idempotencyKey: key() }))

    expect(await kindOf(capture(hold.authorizationId, 40_00, true))).toBe('rejected')
    expect(await kindOf(paypal.releaseHold({ authorizationId: hold.authorizationId, idempotencyKey: key() }))).toBe('rejected')
    expect(await kindOf(capture(renewed.authorizationId, 40_00, true))).toBe('ok')
  })

  it('is allowed only once per hold', async () => {
    const hold = await placeHold()
    onDay(4)
    const renewed = valueOf(await paypal.renewHold({ authorizationId: hold.authorizationId, idempotencyKey: key() }))
    onDay(10)

    expect(await kindOf(paypal.renewHold({ authorizationId: renewed.authorizationId, idempotencyKey: key() }))).toBe('rejected')
    expect(await kindOf(capture(renewed.authorizationId, 40_00, true))).toBe('ok')
  })

  it('can be voided after a capture that was not final, which releases the rest', async () => {
    const hold = await placeHold({ cents: 195_00, currency: 'EUR' })
    await capture(hold.authorizationId, 45_00, false)

    const released = valueOf(await paypal.releaseHold({ authorizationId: hold.authorizationId, idempotencyKey: key() }))

    expect(released.status).toBe('voided')
    expect(await kindOf(capture(hold.authorizationId, 1_00, true))).toBe('hold_voided')
  })

  it('renews once when the same request is sent twice', async () => {
    const hold = await placeHold()
    onDay(4)
    const sameKey = key()

    const first = valueOf(await paypal.renewHold({ authorizationId: hold.authorizationId, idempotencyKey: sameKey }))
    const second = valueOf(await paypal.renewHold({ authorizationId: hold.authorizationId, idempotencyKey: sameKey }))

    expect(second.authorizationId).toBe(first.authorizationId)
  })

  it('is refused once the hold has expired, renewed or not', async () => {
    const hold = await placeHold()
    onDay(27)
    const renewed = valueOf(await paypal.renewHold({ authorizationId: hold.authorizationId, idempotencyKey: key() }))
    onDay(29)

    expect(await kindOf(paypal.renewHold({ authorizationId: renewed.authorizationId, idempotencyKey: key() }))).toBe('hold_expired')
    expect(await kindOf(capture(renewed.authorizationId, 40_00, true))).toBe('hold_expired')
  })

  it.each(['captured', 'voided'] as const)('is refused for a hold that was %s', async (ending) => {
    const hold = await placeHold()
    if (ending === 'captured') await capture(hold.authorizationId, 40_00, true)
    else await paypal.releaseHold({ authorizationId: hold.authorizationId, idempotencyKey: key() })
    onDay(4)

    const expected = ending === 'captured' ? 'hold_already_captured' : 'hold_voided'
    expect(await kindOf(paypal.renewHold({ authorizationId: hold.authorizationId, idempotencyKey: key() }))).toBe(expected)
  })
})

describe('capturing from a hold', () => {
  it('releases the remainder when the capture is final', async () => {
    const hold = await placeHold()

    const captured = valueOf(await capture(hold.authorizationId, 40_00, true))

    expect(captured).toMatchObject({ status: 'completed', amount: { cents: 40_00, currency: 'EUR' }, finalCapture: true })
    expect(valueOf(await paypal.readAuthorization(hold.authorizationId)).status).toBe('captured')
    expect(await kindOf(capture(hold.authorizationId, 1_00, true))).toBe('hold_already_captured')
  })

  it('keeps the remainder held when the capture is not final', async () => {
    const hold = await placeHold({ cents: 195_00, currency: 'EUR' })

    await capture(hold.authorizationId, 45_00, false)

    expect(valueOf(await paypal.readAuthorization(hold.authorizationId)).status).toBe('partially_captured')
    expect(await kindOf(capture(hold.authorizationId, 150_01, true))).toBe('amount_exceeds_hold')
    expect(await kindOf(capture(hold.authorizationId, 150_00, true))).toBe('ok')
  })

  it('never takes more than was reserved', async () => {
    const hold = await placeHold()

    expect(await kindOf(capture(hold.authorizationId, 150_01, true))).toBe('amount_exceeds_hold')
    expect(valueOf(await paypal.readAuthorization(hold.authorizationId)).status).toBe('created')
  })

  it('captures once when the same request is sent twice', async () => {
    const hold = await placeHold()
    const input = { authorizationId: hold.authorizationId, amount: { cents: 40_00, currency: 'EUR' }, finalCapture: false, idempotencyKey: key() }

    const first = valueOf(await paypal.captureFromHold(input))
    const second = valueOf(await paypal.captureFromHold(input))

    expect(second.captureId).toBe(first.captureId)
    expect(await kindOf(capture(hold.authorizationId, 110_00, true))).toBe('ok')
  })

  it('is refused on the 29th day, when the hold is gone', async () => {
    const hold = await placeHold()
    onDay(29)

    expect(await kindOf(capture(hold.authorizationId, 40_00, true))).toBe('hold_expired')
  })

  it('reads as expired from the 29th day, as PayPal reports it', async () => {
    const hold = await placeHold()
    onDay(28)
    expect(valueOf(await paypal.readAuthorization(hold.authorizationId)).status).toBe('created')
    onDay(29)
    expect(valueOf(await paypal.readAuthorization(hold.authorizationId)).status).toBe('expired')
  })
})

describe('releasing a hold', () => {
  it('voids it, and nothing can be captured afterwards', async () => {
    const hold = await placeHold()

    const released = valueOf(await paypal.releaseHold({ authorizationId: hold.authorizationId, idempotencyKey: key() }))

    expect(released.status).toBe('voided')
    expect(await kindOf(capture(hold.authorizationId, 1_00, true))).toBe('hold_voided')
  })

  it('reports an identifier PayPal does not know', async () => {
    expect(await kindOf(paypal.releaseHold({ authorizationId: 'FAKE-AUTH-9999', idempotencyKey: key() }))).toBe('not_found')
  })
})

describe('a rental fee in the fake', () => {
  const FEE: Money = { cents: 120_00, currency: 'EUR' }
  const order = (fake: FakePayPal) =>
    fake.createFeeOrder({ amount: FEE, rentalReference: 'rental-1', description: 'Rental fee', returnUrl: 'https://hold.test/paid', cancelUrl: 'https://hold.test/r', idempotencyKey: key() })

  it('cannot be captured before the renter approves it', async () => {
    const created = valueOf(await order(paypal))
    expect(await paypal.captureFeeOrder({ orderId: created.orderId, idempotencyKey: key() })).toMatchObject({ ok: false, error: { kind: 'order_not_approved' } })
    expect(await paypal.readFeePayment(created.orderId)).toMatchObject({ ok: false, error: { kind: 'not_paid' } })
  })

  it('is captured once approved, names who paid, and gives the same answer to a repeated key', async () => {
    const created = valueOf(await order(paypal))
    paypal.approveOrder(created.orderId)
    const first = valueOf(await paypal.captureFeeOrder({ orderId: created.orderId, idempotencyKey: 'fee-capture-1' }))
    expect(first).toMatchObject({ orderId: created.orderId, status: 'completed', amount: FEE, payer: { payerId: 'FAKEPAYER0001' } })
    expect(valueOf(await paypal.captureFeeOrder({ orderId: created.orderId, idempotencyKey: 'fee-capture-1' }))).toEqual(first)
    expect(valueOf(await paypal.captureFeeOrder({ orderId: created.orderId, idempotencyKey: 'fee-capture-2' }))).toEqual(first)
    expect(valueOf(await paypal.readFeePayment(created.orderId))).toEqual(first)
  })

  it('opens a dispute on the payment once captured, when the renter approved it meaning to dispute it', async () => {
    const created = valueOf(await order(paypal))
    paypal.approveOrder(created.orderId, { thenDispute: true })
    expect(valueOf(await paypal.listOpenDisputes())).toEqual([])
    const payment = valueOf(await paypal.captureFeeOrder({ orderId: created.orderId, idempotencyKey: key() }))
    const [dispute] = valueOf(await paypal.listOpenDisputes())
    expect(dispute).toMatchObject({ open: true, amount: FEE, captureIds: [payment.captureId], responseDueAt: addDays(PLACED_AT, 10) })
    await paypal.captureFeeOrder({ orderId: created.orderId, idempotencyKey: key() })
    expect(valueOf(await paypal.listOpenDisputes())).toHaveLength(1)
  })

  it('remembers where the order sends the renter back, and what it is for', async () => {
    const created = valueOf(await order(paypal))
    expect(paypal.orderLinks(created.orderId)).toEqual({ returnUrl: 'https://hold.test/paid', cancelUrl: 'https://hold.test/r', amount: FEE, description: 'Rental fee' })
    expect(paypal.orderLinks('FAKE-ORDER-9999')).toBeUndefined()
  })

  it('sends the renter to the approval address it was given', async () => {
    const fake = createFakePayPal({ now: () => now, approvalUrl: (orderId) => `https://hold.test/simulated-paypal/${orderId}` })
    const created = valueOf(await order(fake))
    expect(created.approvalUrl).toBe(`https://hold.test/simulated-paypal/${created.orderId}`)
  })
})

describe('webhooks in the fake', () => {
  const headers = { transmissionId: 'T-1', transmissionTime: '2026-10-15T09:00:00Z', transmissionSig: 'fake-signature', certUrl: 'fake', authAlgo: 'fake' }

  it('subscribes once per address', async () => {
    const first = valueOf(await paypal.createWebhook({ url: 'https://hold.test/a', eventTypes: [] }))
    expect(valueOf(await paypal.createWebhook({ url: 'https://hold.test/a', eventTypes: [] }))).toEqual(first)
  })

  it('verifies only what it signed itself, for its own webhook', async () => {
    const { webhookId } = valueOf(await paypal.createWebhook({ url: 'https://hold.test/b', eventTypes: [] }))
    expect(valueOf(await paypal.verifyWebhook({ webhookId, headers, body: '{}' }))).toBe('verified')
    expect(valueOf(await paypal.verifyWebhook({ webhookId, headers: { ...headers, transmissionSig: 'forged' }, body: '{}' }))).toBe('rejected')
    expect(valueOf(await paypal.verifyWebhook({ webhookId: 'unknown', headers, body: '{}' }))).toBe('rejected')
  })
})
