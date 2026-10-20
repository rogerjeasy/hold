import type { Money, Result } from '@hold/domain'

// The hold lifecycle as Hold needs it from PayPal. Every caller reaches PayPal through this and nothing else.

export type HoldOrderStatus = 'awaiting_approval' | 'approved' | 'completed' | 'voided'

export type HoldOrder = {
  readonly orderId: string
  readonly status: HoldOrderStatus
  // Where the renter approves the hold. Absent once the order no longer needs approving.
  readonly approvalUrl: string | undefined
  // Known once the renter has approved.
  readonly payerId: string | undefined
}

export type AuthorizationStatus = 'pending' | 'created' | 'partially_captured' | 'captured' | 'voided' | 'denied' | 'expired'

// One PayPal authorization backing a hold. A renewal gives a new one with a new identifier.
export type Authorization = {
  readonly authorizationId: string
  readonly status: AuthorizationStatus
  readonly amount: Money
  readonly createdAt: Date
  // The end of the hold's validity. A renewal does not move it.
  readonly expiresAt: Date
}

export type CaptureStatus = 'completed' | 'pending' | 'declined' | 'failed' | 'partially_refunded' | 'refunded'

export type Capture = {
  readonly captureId: string
  readonly status: CaptureStatus
  readonly amount: Money
  readonly finalCapture: boolean
  readonly createdAt: Date
}

export type Refund = { readonly refundId: string; readonly captureId: string; readonly status: 'completed' | 'pending' | 'cancelled' | 'failed'; readonly amount: Money; readonly createdAt: Date }

export type PayPalFailureKind =
  // The order was not approved by the renter, so there is nothing to authorize yet.
  | 'order_not_approved'
  // PayPal or the renter's funding source refused the money.
  | 'declined'
  | 'hold_expired'
  | 'hold_voided'
  | 'hold_already_captured'
  // A fee order captured already, perhaps by an earlier attempt.
  | 'already_captured'
  // A webhook subscription for the address exists already.
  | 'webhook_exists'
  | 'amount_exceeds_hold'
  // A renewal was asked for inside the assured period.
  | 'renewal_too_soon'
  | 'not_found'
  // PayPal refused the request for a reason Hold has no name for. The issue says which.
  | 'rejected'
  // PayPal could not be reached, or kept failing, after the retries.
  | 'unavailable'
  // PayPal answered with something Hold could not read. Treated as nothing having happened.
  | 'unexpected_response'
  // The fee order exists but no payment was captured on it.
  | 'not_paid'

export type PayPalFailure = {
  readonly kind: PayPalFailureKind
  // PayPal's own name for the problem, when it gave one.
  readonly issue: string | undefined
  readonly description: string | undefined
  readonly debugId: string | undefined
}

export type PayPalResult<Value> = Result<Value, PayPalFailure>

export type CreateHoldOrderInput = {
  readonly amount: Money
  // Hold's own identifier for the rental, carried on the order so events can be matched back.
  readonly rentalReference: string
  readonly description: string
  readonly returnUrl: string
  readonly cancelUrl: string
  readonly idempotencyKey: string
}

export type PlaceHoldInput = {
  readonly orderId: string
  readonly idempotencyKey: string
}

export type RenewHoldInput = {
  readonly authorizationId: string
  readonly idempotencyKey: string
}

export type ReleaseHoldInput = {
  readonly authorizationId: string
  readonly idempotencyKey: string
}

export type CaptureFromHoldInput = {
  readonly authorizationId: string
  readonly amount: Money
  // True releases whatever is left of the hold. False keeps the remainder reserved.
  readonly finalCapture: boolean
  readonly idempotencyKey: string
}

export type CreateFeeOrderInput = CreateHoldOrderInput

// The person who paid, as PayPal knows them. This is who the renter is (architecture.md section 12.3).
export type Payer = { readonly payerId: string; readonly email: string; readonly name: string | undefined }

// A rental fee PayPal captured.
export type FeePayment = {
  readonly orderId: string
  readonly captureId: string
  readonly status: CaptureStatus
  readonly amount: Money
  readonly payer: Payer
}

export type CaptureFeeInput = { readonly orderId: string; readonly idempotencyKey: string }

// The events Hold subscribes each shop's account to (architecture.md section 8.3). Those it does not act on yet are
// kept and marked ignored.
export const PAYPAL_EVENT_TYPES = [
  'CHECKOUT.ORDER.APPROVED',
  'PAYMENT.CAPTURE.COMPLETED',
  'PAYMENT.CAPTURE.DENIED',
  'PAYMENT.CAPTURE.REFUNDED',
  'PAYMENT.AUTHORIZATION.CREATED',
  'PAYMENT.AUTHORIZATION.VOIDED',
  'INVOICING.INVOICE.PAID',
  'CUSTOMER.DISPUTE.CREATED',
] as const

// The headers PayPal signs an event delivery with.
export type WebhookHeaders = {
  readonly transmissionId: string
  readonly transmissionTime: string
  readonly transmissionSig: string
  readonly certUrl: string
  readonly authAlgo: string
}

export type VerifyWebhookInput = { readonly webhookId: string; readonly headers: WebhookHeaders; readonly body: string }

export type PayPalHolds = {
  // Subscribes Hold's address to events from the shop's account. An address already subscribed keeps its subscription.
  createWebhook(input: { readonly url: string; readonly eventTypes: readonly string[] }): Promise<PayPalResult<{ readonly webhookId: string }>>
  // Asks PayPal whether it signed this exact delivery. Nothing in an event is used before this says verified.
  verifyWebhook(input: VerifyWebhookInput): Promise<PayPalResult<'verified' | 'rejected'>>
  // The rental fee: an ordinary order, captured once the renter approves it.
  createFeeOrder(input: CreateFeeOrderInput): Promise<PayPalResult<HoldOrder>>
  // Captures an approved fee order, then reads it back: PayPal's record is the truth.
  captureFeeOrder(input: CaptureFeeInput): Promise<PayPalResult<FeePayment>>
  readFeePayment(orderId: string): Promise<PayPalResult<FeePayment>>
  createHoldOrder(input: CreateHoldOrderInput): Promise<PayPalResult<HoldOrder>>
  readHoldOrder(orderId: string): Promise<PayPalResult<HoldOrder>>
  // Authorizes an order the renter has approved. This is the moment the money is reserved.
  placeHold(input: PlaceHoldInput): Promise<PayPalResult<Authorization>>
  readAuthorization(authorizationId: string): Promise<PayPalResult<Authorization>>
  // Returns a new authorization. Later captures and releases must use its identifier.
  renewHold(input: RenewHoldInput): Promise<PayPalResult<Authorization>>
  releaseHold(input: ReleaseHoldInput): Promise<PayPalResult<Authorization>>
  captureFromHold(input: CaptureFromHoldInput): Promise<PayPalResult<Capture>>
  refundCapture(input: { readonly captureId: string; readonly amount: Money; readonly idempotencyKey: string }): Promise<PayPalResult<Refund>>
  readRefund(refundId: string, captureId: string): Promise<PayPalResult<Refund>>
  invoiceClaim(input: { readonly invoiceNumber: string; readonly claimReference: string; readonly email: string; readonly amount: Money; readonly description: string; readonly idempotencyKey: string }): Promise<PayPalResult<{ readonly invoiceId: string; readonly status: 'sent' | 'paid'; readonly claimReference: string; readonly amount: Money }>>
  readCapture(captureId: string): Promise<PayPalResult<Capture & { readonly authorizationId: string }>>
}
