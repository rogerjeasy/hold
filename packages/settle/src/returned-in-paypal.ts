import { holdRefundsOfCapture, isRecorded, recordReturnedInPayPal } from '@hold/db'
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

// Whether a refund PayPal reports is already in the money log, as Hold's own. Only a line under the refund's id says so:
// an execution that merely knows the id may still fail. A refund execution of Hold's on the same capture that is still
// pending or submitted is run first, whether or not it knows the id yet, because PayPal may have answered before Hold
// saved it: its call carries the same PayPal-Request-Id, so PayPal gives back the same refund, and Hold records it as
// its own. Whatever is still not in the money log after that is money PayPal returned without Hold, and is recorded so.
async function holdOwnRefund(dependencies: SettleDependencies, shopId: string, refundId: string, captureId: string): Promise<'recorded' | 'ran' | 'not_recorded'> {
  const recorded = () => inWorkerShop(dependencies, shopId, (transaction) => isRecorded(transaction, refundId))
  if (await recorded()) return 'recorded'
  const open = (await inWorkerShop(dependencies, shopId, (transaction) => holdRefundsOfCapture(transaction, captureId))).filter((refund) => (refund.refundId === null || refund.refundId === refundId) && (refund.state === 'pending' || refund.state === 'submitted'))
  for (const refund of open) await runExecution(dependencies, { shopId, executionId: refund.id })
  return open.length > 0 && await recorded() ? 'ran' : 'not_recorded'
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
