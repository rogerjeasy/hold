import { holdRefundsOfCapture, recordReturnedInPayPal } from '@hold/db'
import type { ReturnedInPayPal } from '@hold/db'
import type { PayPalHolds, PayPalResult } from '@hold/paypal'
import { z } from 'zod'
import { PayPalUnavailable, TRANSIENT } from './dependencies.ts'
import type { SettleDependencies } from './dependencies.ts'
import { inWorkerShop } from './execution-queue.ts'
import { runExecution } from './executions.ts'

// Money PayPal returned to the renter from a capture Hold made, without Hold (architecture.md section 8.7): a refund
// made from PayPal's own pages, or a reversal, such as after a lost dispute. The verified event only names what to read;
// PayPal's own record of the refund, or of the capture, says what happened, and only that is written.

export type ReturnedTypes = 'PAYMENT.CAPTURE.REFUNDED' | 'PAYMENT.CAPTURE.REVERSED'

// A refund's event names its capture by its link up, the only thing taken from it; the refund read back from PayPal
// must name the same capture, or nothing is written.
const refundResource = z.object({ id: z.string().min(1), links: z.array(z.object({ rel: z.string(), href: z.string() })) })
const CAPTURE_PATH = /\/v2\/payments\/captures\/([^/?#]+)/

function upCapture(resource: unknown): { readonly refundId: string; readonly captureId: string } | undefined {
  const parsed = refundResource.safeParse(resource)
  const up = parsed.success ? parsed.data.links.find((link) => link.rel === 'up') : undefined
  const captureId = up === undefined ? undefined : CAPTURE_PATH.exec(up.href)?.[1]
  return parsed.success && captureId !== undefined ? { refundId: parsed.data.id, captureId: decodeURIComponent(captureId) } : undefined
}

// A read PayPal could not answer now is tried again by the queue; one it refused, such as a refund it does not know
// on that capture, writes nothing.
function readOrNothing<Value>(read: PayPalResult<Value>): Value | undefined {
  if (read.ok) return read.value
  if (TRANSIENT.has(read.error.kind)) throw new PayPalUnavailable(read.error.kind)
  return undefined
}

async function whatPayPalReturned(dependencies: SettleDependencies, paypal: PayPalHolds, type: ReturnedTypes, resource: unknown): Promise<ReturnedInPayPal | undefined> {
  if (type === 'PAYMENT.CAPTURE.REFUNDED') {
    const named = upCapture(resource)
    if (named === undefined) return undefined
    const refund = readOrNothing(await paypal.readRefund(named.refundId, named.captureId))
    if (refund?.status !== 'completed') return undefined
    return { captureId: refund.captureId, reference: refund.refundId, amount: refund.amount, occurredAt: refund.createdAt }
  }
  const captureId = z.object({ id: z.string().min(1) }).safeParse(resource)
  if (!captureId.success) return undefined
  const capture = readOrNothing(await paypal.readCapture(captureId.data.id))
  if (capture?.status !== 'reversed' || capture.captureId !== captureId.data.id) return undefined
  // PayPal's read-back of a reversed capture names what was captured, not what was reversed: the reversal is whatever of
  // it was not already returned.
  return { captureId: capture.captureId, reference: `${capture.captureId}:reversed`, amount: 'rest_of_capture', occurredAt: dependencies.now() }
}

// Whether a refund PayPal reports is Hold's own. A refund execution of Hold's on the same capture that already knows the
// refund's id names it; one that does not yet, because PayPal answered before Hold saved the id, is run now: its call
// carries the same PayPal-Request-Id, so PayPal gives back the same refund, and Hold records it as its own. Only a
// refund none of them made is money PayPal returned without Hold.
async function holdOwnRefund(dependencies: SettleDependencies, shopId: string, refundId: string, captureId: string): Promise<'recorded' | 'ran' | 'not_hold\'s'> {
  const named = async () => (await inWorkerShop(dependencies, shopId, (transaction) => holdRefundsOfCapture(transaction, captureId)))
  const before = await named()
  if (before.some((refund) => refund.refundId === refundId)) return 'recorded'
  const unknown = before.filter((refund) => refund.refundId === null && (refund.state === 'pending' || refund.state === 'submitted'))
  if (unknown.length === 0) return 'not_hold\'s'
  for (const refund of unknown) await runExecution(dependencies, { shopId, executionId: refund.id })
  return (await named()).some((refund) => refund.refundId === refundId) ? 'ran' : 'not_hold\'s'
}

export async function applyReturnedInPayPal(dependencies: SettleDependencies, shopId: string, paypal: PayPalHolds, event: { readonly type: ReturnedTypes; readonly resource: unknown }): Promise<{ readonly processing: 'applied' | 'ignored'; readonly rentalId: string | null }> {
  const returned = await whatPayPalReturned(dependencies, paypal, event.type, event.resource)
  if (returned !== undefined && event.type === 'PAYMENT.CAPTURE.REFUNDED') {
    const own = await holdOwnRefund(dependencies, shopId, returned.reference, returned.captureId)
    if (own === 'recorded') return { processing: 'ignored', rentalId: null }
    if (own === 'ran') return { processing: 'applied', rentalId: null }
  }
  const recorded = returned === undefined ? undefined : await inWorkerShop(dependencies, shopId, (transaction) => recordReturnedInPayPal(transaction, returned))
  return recorded === undefined ? { processing: 'ignored', rentalId: null } : { processing: 'applied', rentalId: recorded.rentalId }
}
