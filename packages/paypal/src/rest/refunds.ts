import { fail, ok } from '@hold/domain'
import { z } from 'zod'
import { toPayPalAmount } from '../amount.ts'
import type { PayPalHolds } from '../port.ts'
import type { PayPalClient } from './client.ts'
import { amountSchema } from './schemas.ts'
const reference = z.object({ id: z.string().min(1) })
const refundSchema = z.object({ id: z.string().min(1), status: z.enum(['COMPLETED', 'PENDING', 'CANCELLED', 'FAILED']), amount: amountSchema, create_time: z.iso.datetime({ offset: true }).transform((text) => new Date(text)), links: z.array(z.object({ rel: z.string(), href: z.url() })) })
const unreadable = () => fail({ kind: 'unexpected_response' as const, issue: undefined, description: undefined, debugId: undefined })
export function refundCapture(client: PayPalClient): PayPalHolds['refundCapture'] {
  return async (input) => {
    const made = await client.send({ method: 'POST', path: `/v2/payments/captures/${encodeURIComponent(input.captureId)}/refund`, idempotencyKey: input.idempotencyKey, body: { amount: toPayPalAmount(input.amount) } })
    if (!made.ok) return made
    const id = reference.safeParse(made.value.body)
    if (!id.success) return unreadable()
    return readRefund(client)(id.data.id, input.captureId)
  }
}

export function readRefund(client: PayPalClient): PayPalHolds['readRefund'] {
  return async (refundId, captureId) => {
    const read = await client.send({ method: 'GET', path: `/v2/payments/refunds/${encodeURIComponent(refundId)}` })
    if (!read.ok) return read
    const refund = refundSchema.safeParse(read.value.body)
    if (!refund.success || refund.data.id !== refundId || !refund.data.links.some((link) => link.rel === 'up' && new URL(link.href).pathname === `/v2/payments/captures/${captureId}`)) return unreadable()
    return ok({ refundId: refund.data.id, captureId, status: refund.data.status.toLowerCase() as 'completed' | 'pending' | 'cancelled' | 'failed', amount: refund.data.amount, createdAt: refund.data.create_time })
  }
}
