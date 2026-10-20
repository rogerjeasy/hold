import { expect, it } from 'vitest'
import { createRestPayPalHolds } from './holds.ts'
import { createPayPalClient } from './client.ts'
import { stubServer, TOKEN_REPLY } from './stub-server.ts'
const invoice = { id: 'INV2-TEST', status: 'DRAFT', detail: { invoice_number: 'HOLD-001', reference: 'claim-1', currency_code: 'EUR' }, amount: { currency_code: 'EUR', value: '35.00' } }
it('finds or creates the same invoice and reads it back after sending', async () => {
  const server = stubServer([TOKEN_REPLY, { status: 200, body: { items: [] } }, { status: 201, body: { id: invoice.id } }, { status: 200, body: invoice }, { status: 202 }, { status: 200, body: { ...invoice, status: 'UNPAID' } }])
  const paypal = createRestPayPalHolds(createPayPalClient({ environment: 'sandbox', credentials: () => Promise.resolve({ clientId: 'id', clientSecret: 'secret' }), fetch: server.fetch, sleep: () => Promise.resolve() }))
  expect(await paypal.invoiceClaim({ invoiceNumber: 'HOLD-001', claimReference: 'claim-1', email: 'payer@example.com', amount: { cents: 3500, currency: 'EUR' }, description: 'Approved claim', idempotencyKey: 'invoice-execution' })).toMatchObject({ ok: true, value: { invoiceId: invoice.id, status: 'sent', amount: { cents: 3500, currency: 'EUR' }, claimReference: 'claim-1' } })
  expect(server.apiCalls().map((call) => call.path)).toEqual(['/v2/invoicing/search-invoices', '/v2/invoicing/invoices', '/v2/invoicing/invoices/INV2-TEST', '/v2/invoicing/invoices/INV2-TEST/send', '/v2/invoicing/invoices/INV2-TEST'])
})
