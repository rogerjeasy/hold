import * as z from 'zod'
import { fromPayPalAmount } from '../amount.ts'

// What Hold reads from PayPal's replies. PayPal sends much more, and the rest is left alone.

export const amountSchema = z.object({ currency_code: z.string().length(3), value: z.string() }).transform((amount, context) => {
  const money = fromPayPalAmount(amount)
  if (money === undefined) {
    context.addIssue({ code: 'custom', message: 'Not a PayPal amount.' })
    return z.NEVER
  }
  return money
})

const timeSchema = z.iso.datetime({ offset: true }).transform((text) => new Date(text))

export const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
})

export const errorSchema = z.object({
  name: z.string().optional(),
  message: z.string().optional(),
  debug_id: z.string().optional(),
  details: z.array(z.object({ issue: z.string().optional(), description: z.string().optional() })).optional(),
})

export const orderSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['CREATED', 'SAVED', 'APPROVED', 'VOIDED', 'COMPLETED', 'PAYER_ACTION_REQUIRED']),
  links: z.array(z.object({ href: z.string(), rel: z.string() })).optional(),
  payer: z.object({ payer_id: z.string().optional(), email_address: z.string().min(1).optional(), name: z.object({ given_name: z.string().optional(), surname: z.string().optional() }).optional() }).optional(),
})

// The reply to authorizing an order. Only the new authorization's identifier is taken, and the rest is read back.
export const authorizedOrderSchema = z
  .object({
    purchase_units: z.array(z.object({ payments: z.object({ authorizations: z.array(z.object({ id: z.string().min(1) })) }) })),
  })
  .transform((order, context) => {
    const authorizationId = order.purchase_units[0]?.payments.authorizations[0]?.id
    if (authorizationId === undefined) {
      context.addIssue({ code: 'custom', message: 'The order carries no authorization.' })
      return z.NEVER
    }
    return { authorizationId }
  })

export const authorizationReferenceSchema = z.object({ id: z.string().min(1) })

export const authorizationSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['CREATED', 'CAPTURED', 'DENIED', 'EXPIRED', 'PARTIALLY_CAPTURED', 'VOIDED', 'PENDING']),
  amount: amountSchema,
  create_time: timeSchema,
  expiration_time: timeSchema,
})

export const captureSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['COMPLETED', 'DECLINED', 'PARTIALLY_REFUNDED', 'PENDING', 'REFUNDED', 'FAILED']),
  amount: amountSchema,
  final_capture: z.boolean(),
  create_time: timeSchema,
})

// An order read back after its fee was captured: who paid, and the capture.
export const feeOrderSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  payer: z
    .object({
      payer_id: z.string().min(1),
      email_address: z.string().min(1).optional(),
      name: z.object({ given_name: z.string().optional(), surname: z.string().optional() }).optional(),
    })
    .optional(),
  purchase_units: z.array(z.object({ payments: z.object({ captures: z.array(captureSchema.omit({ final_capture: true }).extend({ final_capture: z.boolean().default(true) })).optional() }).optional() })).optional(),
})

export const webhookSchema = z.object({ id: z.string().min(1) })
export const webhookListSchema = z.object({ webhooks: z.array(z.object({ id: z.string().min(1), url: z.string() })) })
export const verificationSchema = z.object({ verification_status: z.enum(['SUCCESS', 'FAILURE']) })

export type PayPalOrder = z.infer<typeof orderSchema>
export type PayPalFeeOrder = z.infer<typeof feeOrderSchema>
export type PayPalAuthorization = z.infer<typeof authorizationSchema>
export type PayPalCapture = z.infer<typeof captureSchema>

export const captureReadSchema = captureSchema.extend({ supplementary_data: z.object({ related_ids: z.object({ authorization_id: z.string().min(1) }) }) })
