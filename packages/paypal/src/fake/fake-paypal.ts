import { addDays, fail, HOLD_ASSURED_DAYS, HOLD_VALIDITY_DAYS, ok } from '@hold/domain'
import type { Money } from '@hold/domain'
import type {
  Authorization,
  AuthorizationStatus,
  Capture,
  FeePayment,
  HoldOrder,
  HoldOrderStatus,
  OpenDispute,
  PayPalFailure,
  PayPalFailureKind,
  PayPalHolds,
  PayPalResult,
  Refund,
} from '../port.ts'

// PayPal's hold rules in memory, with a clock the caller controls. The sandbox cannot move time forward, so
// renewal and expiry are exercised here. Rules the sandbox trials have not yet confirmed are marked.

// The signature the fake puts on the events it sends, and the only one it verifies.
export const FAKE_SIGNATURE = 'fake-signature'

export type FakePayPal = PayPalHolds & {
  // Stands in for the renter approving the order on PayPal's page. In the test environment the renter may approve a
  // payment meaning to dispute it: once it is captured, a dispute on it opens, as a renter's dispute would. A tester may
  // also have PayPal hold the capture for review, or take another amount than the order's.
  approveOrder(orderId: string, options?: { readonly thenDispute?: boolean; readonly capture?: FakeCapture }): void
  // Stands in for PayPal finishing its review of a pending capture. Gives the capture, or nothing when none is pending.
  finishReview(orderId: string, outcome: 'completed' | 'declined'): string | undefined
  // Stands in for the renter's funding source refusing the hold when it is authorized.
  declineFunding(orderId: string): void
  // Where an order sends the renter back, and what it is for: what a simulated approval page needs.
  orderLinks(orderId: string): { readonly returnUrl: string; readonly cancelUrl: string; readonly amount: Money; readonly description: string; readonly brandName: string; readonly underReview: boolean } | undefined
  // Stands in for a renter opening a dispute with PayPal.
  openDispute(dispute: OpenDispute): void
  // Stands in for PayPal taking a capture's money back, as after a chargeback or a lost dispute.
  reverseCapture(captureId: string): void
  // The evidence the shop gave on each dispute, in order: its notes and the name of the document it attached.
  readonly disputeEvidence: { readonly disputeId: string; readonly notes: string; readonly fileName: string | null }[]
}

// How the fake captures an approved order: as PayPal normally does, held for review, or for another amount.
export type FakeCapture = 'normal' | 'review' | 'other_amount'

export type FakePayPalOptions = {
  readonly now: () => Date
  // Where the renter is sent to approve an order. The test app points it at its own simulated approval page.
  readonly approvalUrl?: (orderId: string) => string
}

type FakeOrder = {
  readonly orderId: string
  readonly amount: Money
  status: HoldOrderStatus
  readonly returnUrl: string
  readonly cancelUrl: string
  readonly description: string
  readonly brandName: string
  // Set when a fee order is captured.
  payment: FeePayment | undefined
  // The renter will dispute the payment once it is captured.
  thenDispute: boolean
  capture: FakeCapture
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
  // The original, on a renewal. PayPal's sandbox, 28 October 2026: the two share one life. Voiding the original voided
  // the renewal, and a final capture on the renewal left the original captured.
  readonly renewedFrom: string | undefined
}

const FAKE_PAYER = { payerId: 'FAKEPAYER0001', email: 'renter@fake-paypal.test', name: 'Fake Renter' }

function failure(kind: PayPalFailureKind, description: string, issue?: string): PayPalResult<never> {
  const error: PayPalFailure = { kind, issue, description, debugId: undefined }
  return fail(error)
}

export function createFakePayPal(options: FakePayPalOptions): FakePayPal {
  const orders = new Map<string, FakeOrder>()
  const disputes: OpenDispute[] = []
  const disputeEvidence: { disputeId: string; notes: string; fileName: string | null }[] = []
  const authorizations = new Map<string, FakeAuthorization>()
  const repliesByKey = new Map<string, unknown>()
  let lastNumber = 0
  const webhooks = new Map<string, string>()
  const declined = new Set<string>()

  const refunds = new Map<string, Refund>()
  const captures = new Map<string, Capture & { readonly authorizationId: string }>()

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
      approvalUrl: awaiting ? (options.approvalUrl?.(order.orderId) ?? `https://fake-paypal.test/approve/${order.orderId}`) : undefined,
      payer: awaiting ? undefined : FAKE_PAYER,
    }
  }

  function toAuthorization(authorization: FakeAuthorization): Authorization {
    // PayPal reports a hold still open at the end of its validity as expired.
    const lapsed = options.now() >= authorization.expiresAt && (authorization.status === 'created' || authorization.status === 'partially_captured')
    return {
      authorizationId: authorization.authorizationId,
      status: lapsed ? 'expired' : authorization.status,
      amount: authorization.amount,
      createdAt: authorization.createdAt,
      expiresAt: authorization.expiresAt,
    }
  }

  function open(authorization: FakeAuthorization): void {
    authorizations.set(authorization.authorizationId, authorization)
  }

  // Finds an authorization that can still be acted on, or says why it cannot. PayPal's sandbox still captured on a
  // renewed authorization's old identifier on 28 October 2026; voiding or renewing it again was not tried, and is
  // refused here.
  function usable(authorizationId: string, action: 'capture' | 'void' | 'other' = 'other'): PayPalResult<FakeAuthorization> {
    const authorization = authorizations.get(authorizationId)
    if (authorization === undefined) return failure('not_found', 'No such authorization.')
    if (authorization.status === 'voided') return failure('hold_voided', 'The authorization was voided.')
    if (authorization.status === 'captured') return failure('hold_already_captured', 'The authorization was captured in full.')
    if (authorization.renewedBy !== undefined && action === 'other') {
      return failure('rejected', `The authorization was renewed. Use ${authorization.renewedBy}.`, 'FAKE_AUTHORIZATION_RENEWED')
    }
    if (options.now() >= authorization.expiresAt) return failure('hold_expired', 'The authorization has expired.')
    return ok(authorization)
  }

  return {
    approveOrder(orderId, approval) {
      const order = orders.get(orderId)
      if (order === undefined) throw new Error(`The fake PayPal has no order ${orderId}.`)
      if (order.status === 'awaiting_approval') order.status = 'approved'
      order.thenDispute = approval?.thenDispute === true
      order.capture = approval?.capture ?? 'normal'
    },

    finishReview(orderId, outcome) {
      const order = orders.get(orderId)
      if (order?.payment?.status !== 'pending') return undefined
      order.payment = { ...order.payment, status: outcome }
      return order.payment.captureId
    },

    declineFunding(orderId) {
      declined.add(orderId)
    },

    openDispute(dispute) {
      disputes.push(dispute)
    },

    reverseCapture(captureId) {
      const capture = captures.get(captureId)
      if (capture !== undefined) captures.set(captureId, { ...capture, status: 'reversed' })
    },

    listOpenDisputes() {
      return Promise.resolve(ok(disputes.filter((dispute) => dispute.open)))
    },

    disputeEvidence,

    provideDisputeEvidence(input) {
      once('dispute-evidence', input.idempotencyKey, () => { disputeEvidence.push({ disputeId: input.disputeId, notes: input.notes, fileName: input.document?.fileName ?? null }); return undefined })
      return Promise.resolve(ok(undefined))
    },

    createHoldOrder(input) {
      const order = once('create', input.idempotencyKey, () => {
        const created: FakeOrder = { orderId: nextId('FAKE-ORDER'), amount: input.amount, status: 'awaiting_approval', returnUrl: input.returnUrl, cancelUrl: input.cancelUrl, description: input.description, brandName: input.brandName, payment: undefined, thenDispute: false, capture: 'normal' }
        orders.set(created.orderId, created)
        return created
      })
      return Promise.resolve(ok(toHoldOrder(order)))
    },

    createWebhook(input) {
      const webhookId = webhooks.get(input.url) ?? nextId('FAKE-WEBHOOK')
      webhooks.set(input.url, webhookId)
      return Promise.resolve(ok({ webhookId }))
    },

    verifyWebhook(input) {
      const known = [...webhooks.values()].includes(input.webhookId)
      return Promise.resolve(ok(known && input.headers.transmissionSig === FAKE_SIGNATURE ? 'verified' : 'rejected'))
    },

    orderLinks(orderId) {
      const order = orders.get(orderId)
      return order === undefined ? undefined : { returnUrl: order.returnUrl, cancelUrl: order.cancelUrl, amount: order.amount, description: order.description, brandName: order.brandName, underReview: order.payment?.status === 'pending' }
    },

    createFeeOrder(input) {
      const order = once('create', input.idempotencyKey, () => {
        const created: FakeOrder = { orderId: nextId('FAKE-ORDER'), amount: input.amount, status: 'awaiting_approval', returnUrl: input.returnUrl, cancelUrl: input.cancelUrl, description: input.description, brandName: input.brandName, payment: undefined, thenDispute: false, capture: 'normal' }
        orders.set(created.orderId, created)
        return created
      })
      return Promise.resolve(ok(toHoldOrder(order)))
    },

    captureFeeOrder(input) {
      const result = once('capture-order', input.idempotencyKey, (): PayPalResult<FeePayment> => {
        const order = orders.get(input.orderId)
        if (order === undefined) return failure('not_found', 'No such order.')
        // A second capture of a captured order reads it instead, as the REST adapter does with ORDER_ALREADY_CAPTURED.
        if (order.payment !== undefined) return ok(order.payment)
        if (order.status !== 'approved') return failure('order_not_approved', 'The renter has not approved the order.')
        const amount = order.capture === 'other_amount' ? { ...order.amount, cents: order.amount.cents + 1_00 } : order.amount
        order.payment = { orderId: order.orderId, captureId: nextId('FAKE-CAPTURE'), status: order.capture === 'review' ? 'pending' : 'completed', amount, payer: FAKE_PAYER }
        // A capture like any other, which PayPal can refund or reverse. It was paid on its own order, so no
        // authorization stands behind it.
        captures.set(order.payment.captureId, { captureId: order.payment.captureId, status: order.payment.status === 'pending' ? 'pending' : 'completed', amount, finalCapture: true, createdAt: options.now(), authorizationId: '' })
        order.status = 'completed'
        if (order.thenDispute) disputes.push({ id: nextId('FAKE-DISPUTE'), open: true, amount: order.amount, responseDueAt: addDays(options.now(), 10), captureIds: [order.payment.captureId] })
        return ok(order.payment)
      })
      return Promise.resolve(result)
    },

    readFeePayment(orderId) {
      const order = orders.get(orderId)
      if (order === undefined) return Promise.resolve(failure('not_found', 'No such order.'))
      return Promise.resolve(order.payment === undefined ? failure('not_paid', 'The order has no capture.') : ok(order.payment))
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
        if (declined.has(order.orderId)) return failure('declined', 'The funding source was declined.', 'INSTRUMENT_DECLINED')
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
          renewedFrom: undefined,
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
        // PayPal's sandbox, 28 October 2026 (tech-stack.md section 16, item 3): a renewal with no amount asks for the
        // original amount, which PayPal refuses once part of the hold was captured. One asking for what is still held
        // renews.
        const asked = input.amount ?? current.value.amount
        const stillHeld = current.value.amount.cents - current.value.capturedCents
        if (asked.currency !== current.value.amount.currency || asked.cents <= 0 || asked.cents > stillHeld) return failure('rejected', 'The renewal asks for more than is still reserved.', 'AUTHORIZATION_AMOUNT_EXCEEDED')
        const renewed: FakeAuthorization = {
          authorizationId: nextId('FAKE-AUTH'),
          amount: asked,
          createdAt: now,
          // A renewal starts a new assured period. Its end of validity stays where the original's was, give or take
          // the second PayPal reported it one second later in the sandbox on 28 October 2026.
          expiresAt: new Date(current.value.expiresAt.getTime() + 1000),
          status: 'created',
          capturedCents: 0,
          isRenewal: true,
          renewedBy: undefined,
          renewedFrom: current.value.authorizationId,
        }
        open(renewed)
        current.value.renewedBy = renewed.authorizationId
        return ok(renewed)
      })
      return Promise.resolve(result.ok ? ok(toAuthorization(result.value)) : result)
    },

    releaseHold(input) {
      const result = once('void', input.idempotencyKey, (): PayPalResult<FakeAuthorization> => {
        // A partly captured authorization can be voided, which releases what is left. Confirmed in the sandbox. Voiding
        // an original voids its renewal too.
        const current = usable(input.authorizationId, 'void')
        if (!current.ok) return current
        current.value.status = 'voided'
        const renewal = current.value.renewedBy === undefined ? undefined : authorizations.get(current.value.renewedBy)
        if (renewal !== undefined && renewal.status !== 'captured') renewal.status = 'voided'
        return current
      })
      return Promise.resolve(result.ok ? ok(toAuthorization(result.value)) : result)
    },

    refundCapture(input) {
      return Promise.resolve(once('refund', input.idempotencyKey, () => {
        const capture = captures.get(input.captureId)
        if (capture === undefined || input.amount.currency !== capture.amount.currency || input.amount.cents > capture.amount.cents) return failure('rejected', 'Invalid refund.')
        const refund: Refund = { refundId: nextId('FAKE-REFUND'), captureId: input.captureId, status: 'completed', amount: input.amount, createdAt: options.now() }
        refunds.set(refund.refundId, refund)
        return ok(refund)
      }))
    },

    readRefund(refundId, captureId) {
      const refund = refunds.get(refundId)
      return Promise.resolve(refund === undefined || refund.captureId !== captureId ? failure('not_found', 'No such refund.') : ok(refund))
    },

    invoiceClaim(input) {
      return Promise.resolve(once('invoice', input.idempotencyKey, () => ok({ invoiceId: nextId('FAKE-INVOICE'), status: 'sent' as const, amount: input.amount, claimReference: input.claimReference })))
    },

    readCapture(captureId) {
      const capture = captures.get(captureId)
      return Promise.resolve(capture === undefined ? failure('not_found', 'No such capture.') : ok(capture))
    },

    captureFromHold(input) {
      const result = once('capture', input.idempotencyKey, (): PayPalResult<Capture> => {
        const current = usable(input.authorizationId, 'capture')
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
        const original = authorization.renewedFrom === undefined ? undefined : authorizations.get(authorization.renewedFrom)
        if (finalCapture && original !== undefined) original.status = 'captured'
        const capture: Capture = {
          captureId: nextId('FAKE-CAPTURE'),
          status: 'completed',
          amount: input.amount,
          finalCapture,
          createdAt: options.now(),
        }
        captures.set(capture.captureId, { ...capture, authorizationId: input.authorizationId })
        return ok(capture)
      })
      return Promise.resolve(result)
    },
  }
}
