import { fail, ok } from '@hold/domain'
import type * as z from 'zod'
import { toPayPalAmount } from '../amount.ts'
import type {
  Authorization,
  AuthorizationStatus,
  Capture,
  CaptureStatus,
  CreateHoldOrderInput,
  FeePayment,
  HoldOrder,
  HoldOrderStatus,
  PayPalHolds,
  PayPalResult,
} from '../port.ts'
import type { PayPalClient, PayPalReply } from './client.ts'
import {
  authorizationReferenceSchema,
  authorizationSchema,
  authorizedOrderSchema,
  captureSchema,
  feeOrderSchema,
  orderSchema,
} from './schemas.ts'
import type { PayPalAuthorization, PayPalCapture, PayPalFeeOrder, PayPalOrder } from './schemas.ts'

const ORDERS_PATH = '/v2/checkout/orders'
const AUTHORIZATIONS_PATH = '/v2/payments/authorizations'
// The link PayPal names differently depending on how the order was created. Both lead the renter to approve.
const APPROVAL_LINKS: ReadonlySet<string> = new Set(['payer-action', 'approve'])

const ORDER_STATUS: Record<PayPalOrder['status'], HoldOrderStatus> = {
  CREATED: 'awaiting_approval',
  SAVED: 'awaiting_approval',
  PAYER_ACTION_REQUIRED: 'awaiting_approval',
  APPROVED: 'approved',
  COMPLETED: 'completed',
  VOIDED: 'voided',
}

const AUTHORIZATION_STATUS: Record<PayPalAuthorization['status'], AuthorizationStatus> = {
  PENDING: 'pending',
  CREATED: 'created',
  PARTIALLY_CAPTURED: 'partially_captured',
  CAPTURED: 'captured',
  VOIDED: 'voided',
  DENIED: 'denied',
}

const CAPTURE_STATUS: Record<PayPalCapture['status'], CaptureStatus> = {
  COMPLETED: 'completed',
  PENDING: 'pending',
  DECLINED: 'declined',
  FAILED: 'failed',
  PARTIALLY_REFUNDED: 'partially_refunded',
  REFUNDED: 'refunded',
}

function read<Shape>(schema: z.ZodType<Shape>, reply: PayPalResult<PayPalReply>): PayPalResult<Shape> {
  if (!reply.ok) return reply
  const parsed = schema.safeParse(reply.value.body)
  if (parsed.success) return ok(parsed.data)
  const description = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
  return fail({ kind: 'unexpected_response', issue: undefined, description, debugId: reply.value.debugId })
}

function toHoldOrder(order: PayPalOrder): HoldOrder {
  const status = ORDER_STATUS[order.status]
  return {
    orderId: order.id,
    status,
    approvalUrl: status === 'awaiting_approval' ? order.links?.find((link) => APPROVAL_LINKS.has(link.rel))?.href : undefined,
    payerId: order.payer?.payer_id,
  }
}

function toAuthorization(authorization: PayPalAuthorization): Authorization {
  return {
    authorizationId: authorization.id,
    status: AUTHORIZATION_STATUS[authorization.status],
    amount: authorization.amount,
    createdAt: authorization.create_time,
    expiresAt: authorization.expiration_time,
  }
}

function toCapture(capture: PayPalCapture): Capture {
  return {
    captureId: capture.id,
    status: CAPTURE_STATUS[capture.status],
    amount: capture.amount,
    finalCapture: capture.final_capture,
    createdAt: capture.create_time,
  }
}

function toFeePayment(order: PayPalFeeOrder, debugId: string | undefined): PayPalResult<FeePayment> {
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0]
  if (capture === undefined) return fail({ kind: 'not_paid', issue: undefined, description: `Order ${order.id} has no capture.`, debugId })
  // A captured order always names who paid. Without that, Hold cannot say who the renter is.
  if (order.payer?.email_address === undefined) return fail({ kind: 'unexpected_response', issue: undefined, description: `Order ${order.id} names no payer.`, debugId })
  const name = [order.payer.name?.given_name, order.payer.name?.surname].filter((part) => part !== undefined && part !== '').join(' ')
  return ok({
    orderId: order.id,
    captureId: capture.id,
    status: CAPTURE_STATUS[capture.status],
    amount: capture.amount,
    payer: { payerId: order.payer.payer_id, email: order.payer.email_address, name: name === '' ? undefined : name },
  })
}

function mapped<From, To>(result: PayPalResult<From>, map: (value: From) => To): PayPalResult<To> {
  return result.ok ? ok(map(result.value)) : result
}

function authorizationPath(authorizationId: string, action?: string): string {
  const path = `${AUTHORIZATIONS_PATH}/${encodeURIComponent(authorizationId)}`
  return action === undefined ? path : `${path}/${action}`
}

const orderPath = (orderId: string) => `${ORDERS_PATH}/${encodeURIComponent(orderId)}`

export function createRestPayPalHolds(client: PayPalClient): PayPalHolds {
  async function createOrder(intent: 'AUTHORIZE' | 'CAPTURE', input: CreateHoldOrderInput): Promise<PayPalResult<HoldOrder>> {
    const reply = await client.send({
      method: 'POST',
      path: ORDERS_PATH,
      idempotencyKey: input.idempotencyKey,
      body: {
        intent,
        purchase_units: [{ custom_id: input.rentalReference, description: input.description, amount: toPayPalAmount(input.amount) }],
        payment_source: {
          paypal: {
            experience_context: {
              return_url: input.returnUrl,
              cancel_url: input.cancelUrl,
              user_action: 'PAY_NOW',
              // Nothing is shipped for a rental, so the renter is not asked for an address.
              shipping_preference: 'NO_SHIPPING',
            },
          },
        },
      },
    })
    return mapped(read(orderSchema, reply), toHoldOrder)
  }

  async function readFeePayment(orderId: string): Promise<PayPalResult<FeePayment>> {
    const reply = await client.send({ method: 'GET', path: orderPath(orderId) })
    const order = read(feeOrderSchema, reply)
    return order.ok ? toFeePayment(order.value, reply.ok ? reply.value.debugId : undefined) : order
  }

  async function readAuthorization(authorizationId: string): Promise<PayPalResult<Authorization>> {
    const reply = await client.send({ method: 'GET', path: authorizationPath(authorizationId) })
    return mapped(read(authorizationSchema, reply), toAuthorization)
  }

  return {
    async createHoldOrder(input) {
      return createOrder('AUTHORIZE', input)
    },

    async createFeeOrder(input) {
      return createOrder('CAPTURE', input)
    },

    async captureFeeOrder(input) {
      const reply = await client.send({ method: 'POST', path: `${orderPath(input.orderId)}/capture`, idempotencyKey: input.idempotencyKey })
      if (!reply.ok && reply.error.kind !== 'already_captured') return reply
      // The capture's reply is not the record. The order is read back, whether this call or an earlier one captured it.
      return readFeePayment(input.orderId)
    },

    readFeePayment,

    async readHoldOrder(orderId) {
      const reply = await client.send({ method: 'GET', path: orderPath(orderId) })
      return mapped(read(orderSchema, reply), toHoldOrder)
    },

    async placeHold(input) {
      const reply = await client.send({
        method: 'POST',
        path: `${orderPath(input.orderId)}/authorize`,
        idempotencyKey: input.idempotencyKey,
      })
      const authorized = read(authorizedOrderSchema, reply)
      // PayPal's record is the truth, so the authorization is read back from it instead of taken from this reply.
      return authorized.ok ? readAuthorization(authorized.value.authorizationId) : authorized
    },

    readAuthorization,

    async renewHold(input) {
      const reply = await client.send({
        method: 'POST',
        path: authorizationPath(input.authorizationId, 'reauthorize'),
        idempotencyKey: input.idempotencyKey,
      })
      const renewed = read(authorizationReferenceSchema, reply)
      return renewed.ok ? readAuthorization(renewed.value.id) : renewed
    },

    async releaseHold(input) {
      const reply = await client.send({
        method: 'POST',
        path: authorizationPath(input.authorizationId, 'void'),
        idempotencyKey: input.idempotencyKey,
      })
      return reply.ok ? readAuthorization(input.authorizationId) : reply
    },

    async captureFromHold(input) {
      const reply = await client.send({
        method: 'POST',
        path: authorizationPath(input.authorizationId, 'capture'),
        idempotencyKey: input.idempotencyKey,
        body: { amount: toPayPalAmount(input.amount), final_capture: input.finalCapture },
      })
      return mapped(read(captureSchema, reply), toCapture)
    },
  }
}
