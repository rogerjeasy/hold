import { fail, ok } from '@hold/domain'
import { z } from 'zod'
import type { PayPalHolds } from '../port.ts'
import type { PayPalClient } from './client.ts'
import { amountSchema } from './schemas.ts'

const listSchema = z.object({ items: z.array(z.object({ dispute_id: z.string().min(1) })).default([]) })
const detailSchema = z.object({
  dispute_id: z.string().min(1),
  status: z.string(),
  seller_response_due_date: z.iso.datetime({ offset: true }).optional(),
  dispute_amount: amountSchema.optional(),
  disputed_transactions: z.array(z.object({ seller_transaction_id: z.string().optional() })).default([]),
})
const unreadable = () => fail({ kind: 'unexpected_response' as const, issue: undefined, description: undefined, debugId: undefined })

// The disputes waiting on the shop, each read in full: its due date and the payments it names come only from the
// dispute itself. Plain code reads these for the operations agent's detectors (extensions.md section 6.3).
export function listOpenDisputes(client: PayPalClient): PayPalHolds['listOpenDisputes'] {
  return async () => {
    const listed = await client.send({ method: 'GET', path: '/v1/customer/disputes?dispute_state=REQUIRED_ACTION&page_size=50' })
    if (!listed.ok) return listed
    const items = listSchema.safeParse(listed.value.body)
    if (!items.success) return unreadable()
    const disputes = []
    for (const item of items.data.items) {
      const read = await client.send({ method: 'GET', path: `/v1/customer/disputes/${encodeURIComponent(item.dispute_id)}` })
      if (!read.ok) return read
      const detail = detailSchema.safeParse(read.value.body)
      if (!detail.success || detail.data.dispute_id !== item.dispute_id) return unreadable()
      disputes.push({
        id: detail.data.dispute_id,
        open: detail.data.status !== 'RESOLVED',
        amount: detail.data.dispute_amount ?? null,
        responseDueAt: detail.data.seller_response_due_date === undefined ? null : new Date(detail.data.seller_response_due_date),
        captureIds: detail.data.disputed_transactions.flatMap((transaction) => transaction.seller_transaction_id === undefined ? [] : [transaction.seller_transaction_id]),
      })
    }
    return ok(disputes)
  }
}

// The evidence type each dispute reason takes. PayPal's sandbox, 28 October 2026 (tech-stack.md section 16, item 6):
// for an item not received it refused OTHER with EVIDENCE_TYPE_IS_NOT_ALLOWED and took PROOF_OF_FULFILLMENT, which a
// rental's handover record is. Any other reason sends OTHER until a sandbox dispute shows what it takes.
const EVIDENCE_FOR_REASON: Readonly<Record<string, string>> = { MERCHANDISE_OR_SERVICE_NOT_RECEIVED: 'PROOF_OF_FULFILLMENT' }
const reasonSchema = z.object({ dispute_id: z.string().min(1), reason: z.string().optional() })

// Answers a dispute with evidence (Disputes v1 provide-evidence): the shop's notes as JSON in "input", and the rental's
// evidence pack, when there is one, as a PDF in "evidence-file", both confirmed in the sandbox. The dispute is read
// back first, as its reason decides the evidence type. It moves no money.
export function provideDisputeEvidence(client: PayPalClient): PayPalHolds['provideDisputeEvidence'] {
  return async (input) => {
    const read = await client.send({ method: 'GET', path: `/v1/customer/disputes/${encodeURIComponent(input.disputeId)}` })
    if (!read.ok) return read
    const dispute = reasonSchema.safeParse(read.value.body)
    if (!dispute.success || dispute.data.dispute_id !== input.disputeId) return unreadable()
    const evidenceType = EVIDENCE_FOR_REASON[dispute.data.reason ?? ''] ?? 'OTHER'
    const form = new FormData()
    form.append('input', new Blob([JSON.stringify({ evidences: [{ evidence_type: evidenceType, notes: input.notes }] })], { type: 'application/json' }))
    if (input.document !== undefined) form.append('evidence-file', new Blob([Uint8Array.from(input.document.bytes)], { type: 'application/pdf' }), input.document.fileName)
    const sent = await client.send({ method: 'POST', path: `/v1/customer/disputes/${encodeURIComponent(input.disputeId)}/provide-evidence`, form, idempotencyKey: input.idempotencyKey })
    return sent.ok ? ok(undefined) : sent
  }
}
