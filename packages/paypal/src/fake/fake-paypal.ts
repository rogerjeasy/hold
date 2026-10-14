import { addDays, fail, HOLD_ASSURED_DAYS, HOLD_VALIDITY_DAYS, ok } from '@hold/domain'
import type { Money } from '@hold/domain'
import type {
  Authorization,
  AuthorizationStatus,
  Capture,
  HoldOrder,
  HoldOrderStatus,
  PayPalFailure,
  PayPalFailureKind,
  PayPalHolds,
  PayPalResult,
} from '../port.ts'

// PayPal's hold rules in memory, with a clock the caller controls. The sandbox cannot move time forward, so
// renewal and expiry are exercised here. Rules the sandbox trials have not yet confirmed are marked.

export type FakePayPal = PayPalHolds & {
  // Stands in for the renter approving the hold on PayPal's page.
  approveOrder(orderId: string): void
}

export type FakePayPalOptions = {
  readonly now: () => Date
}

type FakeOrder = {
  readonly orderId: string
  readonly amount: Money
  status: HoldOrderStatus
}

type FakeAuthorization = {
  readonly authorizationId: string
  readonly amount: Money
  readonly createdAt: Date
  readonly expiresAt: Date
  status: AuthorizationStatus
  capturedCents: number
  // True for the authorization a renewal created. PayPal allows one renewal per hold, so it cannot be renewed again.
  readonly isRenewal: boolean
  // Set once a renewal has replaced this authorization.
  renewedBy: string | undefined
}

const FAKE_PAYER_ID = 'FAKEPAYER0001'

function failure(kind: PayPalFailureKind, description: string, issue?: string): PayPalResult<never> {
  const error: PayPalFailure = { kind, issue, description, debugId: undefined }
  return fail(error)
}

export function createFakePayPal(options: FakePayPalOptions): FakePayPal {
  const orders = new Map<string, FakeOrder>()
  const authorizations = new Map<string, FakeAuthorization>()
  const repliesByKey = new Map<string, unknown>()
  let lastNumber = 0

  function nextId(prefix: string): string {
    lastNumber += 1
    return `${prefix}-${String(lastNumber).padStart(4, '0')}`
  }

  // A repeated idempotency key gets the first reply back and changes nothing, as PayPal-Request-Id does.
  function once<Reply>(action: string, idempotencyKey: string, run: () => Reply): Reply {
    const key = `${action}:${idempotencyKey}`
    if (!repliesByKey.has(key)) repliesByKey.set(key, run())
    return repliesByKey.get(key) as Reply
  }

  function toHoldOrder(order: FakeOrder): HoldOrder {
    const awaiting = order.status === 'awaiting_approval'
    return {
      orderId: order.orderId,
      status: order.status,
      approvalUrl: awaiting ? `https://fake-paypal.test/approve/${order.orderId}` : undefined,
      payerId: awaiting ? undefined : FAKE_PAYER_ID,
    }
  }

  function toAuthorization(authorization: FakeAuthorization): Authorization {
    return {
      authorizationId: authorization.authorizationId,
      status: authorization.status,
      amount: authorization.amount,
      createdAt: authorization.createdAt,
      expiresAt: authorization.expiresAt,
    }
  }

  function open(authorization: FakeAuthorization): void {
    authorizations.set(authorization.authorizationId, authorization)
  }

  // Finds an authorization that can still be acted on, or says why it cannot.
  function usable(authorizationId: string): PayPalResult<FakeAuthorization> {
    const authorization = authorizations.get(authorizationId)
    if (authorization === undefined) return failure('not_found', 'No such authorization.')
    if (authorization.status === 'voided') return failure('hold_voided', 'The authorization was voided.')
    if (authorization.status === 'captured') return failure('hold_already_captured', 'The authorization was captured in full.')
    if (authorization.renewedBy !== undefined) {
      return failure('rejected', `The authorization was renewed. Use ${authorization.renewedBy}.`, 'FAKE_AUTHORIZATION_RENEWED')
    }
    if (options.now() >= authorization.expiresAt) return failure('hold_expired', 'The authorization has expired.')
    return ok(authorization)
  }

  return {
    approveOrder(orderId) {
      const order = orders.get(orderId)
      if (order === undefined) throw new Error(`The fake PayPal has no order ${orderId}.`)
      if (order.status === 'awaiting_approval') order.status = 'approved'
    },

    createHoldOrder(input) {
      const order = once('create', input.idempotencyKey, () => {
        const created: FakeOrder = { orderId: nextId('FAKE-ORDER'), amount: input.amount, status: 'awaiting_approval' }
        orders.set(created.orderId, created)
        return created
      })
      return Promise.resolve(ok(toHoldOrder(order)))
    },

    readHoldOrder(orderId) {
      const order = orders.get(orderId)
      return Promise.resolve(order === undefined ? failure('not_found', 'No such order.') : ok(toHoldOrder(order)))
    },

    placeHold(input) {
      const result = once('authorize', input.idempotencyKey, (): PayPalResult<FakeAuthorization> => {
        const order = orders.get(input.orderId)
        if (order === undefined) return failure('not_found', 'No such order.')
        if (order.status !== 'approved') return failure('order_not_approved', 'The renter has not approved the order.')
        const createdAt = options.now()
        const authorization: FakeAuthorization = {
          authorizationId: nextId('FAKE-AUTH'),
          amount: order.amount,
          createdAt,
          expiresAt: addDays(createdAt, HOLD_VALIDITY_DAYS),
          status: 'created',
          capturedCents: 0,
          isRenewal: false,
          renewedBy: undefined,
        }
        open(authorization)
        order.status = 'completed'
        return ok(authorization)
      })
      return Promise.resolve(result.ok ? ok(toAuthorization(result.value)) : result)
    },

    readAuthorization(authorizationId) {
      const authorization = authorizations.get(authorizationId)
      return Promise.resolve(
        authorization === undefined ? failure('not_found', 'No such authorization.') : ok(toAuthorization(authorization)),
      )
    },

    renewHold(input) {
      const result = once('reauthorize', input.idempotencyKey, (): PayPalResult<FakeAuthorization> => {
        const current = usable(input.authorizationId)
        if (!current.ok) return current
        // PayPal's sandbox, 14 October 2026: "A reauthorization is only allowed once from Day 4 to Day 29 since the
        // date of the original authorization." The issue name for a second attempt is not yet known.
        if (current.value.isRenewal) return failure('rejected', 'A hold can be renewed only once.', 'FAKE_ALREADY_RENEWED')
        const now = options.now()
        if (now < addDays(current.value.createdAt, HOLD_ASSURED_DAYS)) {
          return failure('renewal_too_soon', 'A renewal is allowed once the assured period has passed.')
        }
        const renewed: FakeAuthorization = {
          authorizationId: nextId('FAKE-AUTH'),
          // Not confirmed in the sandbox: the renewal is taken to cover what is still reserved.
          amount: { cents: current.value.amount.cents - current.value.capturedCents, currency: current.value.amount.currency },
          createdAt: now,
          // A renewal starts a new assured period and leaves the end of validity where it was.
          expiresAt: current.value.expiresAt,
          status: 'created',
          capturedCents: 0,
          isRenewal: true,
          renewedBy: undefined,
        }
        open(renewed)
        current.value.renewedBy = renewed.authorizationId
        return ok(renewed)
      })
      return Promise.resolve(result.ok ? ok(toAuthorization(result.value)) : result)
    },

    releaseHold(input) {
      const result = once('void', input.idempotencyKey, (): PayPalResult<FakeAuthorization> => {
        // A partly captured authorization can be voided, which releases what is left. Confirmed in the sandbox.
        const current = usable(input.authorizationId)
        if (current.ok) current.value.status = 'voided'
        return current
      })
      return Promise.resolve(result.ok ? ok(toAuthorization(result.value)) : result)
    },

    captureFromHold(input) {
      const result = once('capture', input.idempotencyKey, (): PayPalResult<Capture> => {
        const current = usable(input.authorizationId)
        if (!current.ok) return current
        const authorization = current.value
        if (input.amount.currency !== authorization.amount.currency || input.amount.cents <= 0) {
          return failure('rejected', 'The amount is not valid for this authorization.', 'FAKE_INVALID_AMOUNT')
        }
        const remaining = authorization.amount.cents - authorization.capturedCents
        if (input.amount.cents > remaining) {
          return failure('amount_exceeds_hold', 'The amount is more than what is still reserved.')
        }
        authorization.capturedCents += input.amount.cents
        const finalCapture = input.finalCapture || authorization.capturedCents === authorization.amount.cents
        authorization.status = finalCapture ? 'captured' : 'partially_captured'
        return ok({
          captureId: nextId('FAKE-CAPTURE'),
          status: 'completed',
          amount: input.amount,
          finalCapture,
          createdAt: options.now(),
        })
      })
      return Promise.resolve(result)
    },
  }
}
