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

export type AuthorizationStatus = 'pending' | 'created' | 'partially_captured' | 'captured' | 'voided' | 'denied'

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

export type PayPalFailureKind =
  // The order was not approved by the renter, so there is nothing to authorize yet.
  | 'order_not_approved'
  // PayPal or the renter's funding source refused the money.
  | 'declined'
  | 'hold_expired'
  | 'hold_voided'
  | 'hold_already_captured'
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

export type PayPalHolds = {
  createHoldOrder(input: CreateHoldOrderInput): Promise<PayPalResult<HoldOrder>>
  readHoldOrder(orderId: string): Promise<PayPalResult<HoldOrder>>
  // Authorizes an order the renter has approved. This is the moment the money is reserved.
  placeHold(input: PlaceHoldInput): Promise<PayPalResult<Authorization>>
  readAuthorization(authorizationId: string): Promise<PayPalResult<Authorization>>
  // Returns a new authorization. Later captures and releases must use its identifier.
  renewHold(input: RenewHoldInput): Promise<PayPalResult<Authorization>>
  releaseHold(input: ReleaseHoldInput): Promise<PayPalResult<Authorization>>
  captureFromHold(input: CaptureFromHoldInput): Promise<PayPalResult<Capture>>
}
