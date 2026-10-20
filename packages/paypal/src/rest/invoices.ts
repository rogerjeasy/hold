import { fail, ok } from '@hold/domain'
import { z } from 'zod'
import { toPayPalAmount } from '../amount.ts'
import type { PayPalHolds, PayPalResult } from '../port.ts'
import type { PayPalClient, PayPalReply } from './client.ts'
import { amountSchema } from './schemas.ts'

const invoiceSchema = z.object({ id: z.string().min(1), status: z.string(), detail: z.object({ invoice_number: z.string(), reference: z.string(), currency_code: z.string() }), amount: amountSchema })
const searchSchema = z.object({ items: z.array(z.object({ id: z.string(), detail: z.object({ invoice_number: z.string() }) })).default([]) })
const referenceSchema = z.object({ id: z.string().min(1) })
function read<Value>(schema: z.ZodType<Value>, reply: PayPalResult<PayPalReply>): PayPalResult<Value> {
  if (!reply.ok) return reply
  const parsed = schema.safeParse(reply.value.body)
  return parsed.success ? ok(parsed.data) : fail({ kind: 'unexpected_response', issue: undefined, description: undefined, debugId: reply.value.debugId })
}

export function invoiceClaim(client: PayPalClient): PayPalHolds['invoiceClaim'] {
  return async (input) => {
    // Search by our unique invoice number as well as sending the request key: never depend on undocumented
    // idempotency support in the Invoicing API. A retry resumes the draft that was already created.
    const found = read(searchSchema, await client.send({ method: 'POST', path: '/v2/invoicing/search-invoices', idempotencyKey: `${input.idempotencyKey}-find`, body: { invoice_number: input.invoiceNumber } }))
    if (!found.ok) return found
    let invoiceId = found.value.items.find((invoice) => invoice.detail.invoice_number === input.invoiceNumber)?.id
    if (invoiceId === undefined) {
      const created = read(referenceSchema, await client.send({ method: 'POST', path: '/v2/invoicing/invoices', idempotencyKey: input.idempotencyKey, body: { detail: { invoice_number: input.invoiceNumber, reference: input.claimReference, currency_code: input.amount.currency }, primary_recipients: [{ billing_info: { email_address: input.email } }], items: [{ name: input.description.slice(0, 200), quantity: '1', unit_amount: toPayPalAmount(input.amount) }], configuration: { allow_tip: false, partial_payment: { allow_partial_payment: false } } } }))
      if (!created.ok) return created
      invoiceId = created.value.id
    }
    const path = `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}`
    let invoice = read(invoiceSchema, await client.send({ method: 'GET', path }))
    if (!invoice.ok) return invoice
    const matches = () => invoice.ok && invoice.value.detail.reference === input.claimReference && invoice.value.detail.invoice_number === input.invoiceNumber && invoice.value.amount.cents === input.amount.cents && invoice.value.amount.currency === input.amount.currency
    if (!matches()) return fail({ kind: 'unexpected_response', issue: undefined, description: undefined, debugId: undefined })
    if (invoice.value.status === 'DRAFT') {
      const sent = await client.send({ method: 'POST', path: `${path}/send`, idempotencyKey: `${input.idempotencyKey}-send`, body: { send_to_invoicer: false, send_to_recipient: true } })
      if (!sent.ok) return sent
      invoice = read(invoiceSchema, await client.send({ method: 'GET', path }))
    }
    if (!invoice.ok) return invoice
    if (!matches() || !['SENT', 'UNPAID', 'PAID', 'PARTIALLY_PAID'].includes(invoice.value.status)) return fail({ kind: 'unexpected_response', issue: undefined, description: undefined, debugId: undefined })
    return ok({ invoiceId, status: invoice.value.status === 'PAID' ? 'paid' : 'sent', claimReference: invoice.value.detail.reference, amount: invoice.value.amount })
  }
}
