import { expect, it } from 'vitest'
import { createPayPalClient } from './client.ts'
import { createRestPayPalHolds } from './holds.ts'
import { stubServer, TOKEN_REPLY } from './stub-server.ts'

const client = (server: ReturnType<typeof stubServer>) => createPayPalClient({ environment: 'sandbox', credentials: () => Promise.resolve({ clientId: 'id', clientSecret: 'secret' }), fetch: server.fetch, sleep: () => Promise.resolve() })

it('lists the disputes that need the shop, each read in full for its due date and the payment it names', async () => {
  const listed = { items: [{ dispute_id: 'PP-D-1', status: 'WAITING_FOR_SELLER_RESPONSE', dispute_amount: { currency_code: 'CHF', value: '35.00' } }] }
  const detail = { dispute_id: 'PP-D-1', status: 'WAITING_FOR_SELLER_RESPONSE', seller_response_due_date: '2026-11-02T10:00:00.000Z', dispute_amount: { currency_code: 'CHF', value: '35.00' }, disputed_transactions: [{ seller_transaction_id: 'CAPTURE-9' }] }
  const server = stubServer([TOKEN_REPLY, { status: 200, body: listed }, { status: 200, body: detail }])
  const paypal = createRestPayPalHolds(client(server))
  expect(await paypal.listOpenDisputes()).toEqual({ ok: true, value: [{ id: 'PP-D-1', open: true, amount: { cents: 3500, currency: 'CHF' }, responseDueAt: new Date('2026-11-02T10:00:00.000Z'), captureIds: ['CAPTURE-9'] }] })
  expect(server.apiCalls().map((call) => `${call.path}${call.query}`)).toEqual(['/v1/customer/disputes?dispute_state=REQUIRED_ACTION&page_size=50', '/v1/customer/disputes/PP-D-1'])
})

it('refuses a reply it cannot read rather than guessing', async () => {
  const server = stubServer([TOKEN_REPLY, { status: 200, body: { items: [{ dispute_id: 'PP-D-1' }] } }, { status: 200, body: { unexpected: true } }])
  expect(await createRestPayPalHolds(client(server)).listOpenDisputes()).toMatchObject({ ok: false, error: { kind: 'unexpected_response' } })
})

it('hands out the shop\'s access token for PayPal\'s own MCP server, and nothing more', async () => {
  const server = stubServer([TOKEN_REPLY])
  const token = await client(server).accessToken()
  expect(token.ok).toBe(true)
})

it('sends the shop\'s message on a dispute once, with the idempotency key as PayPal-Request-Id', async () => {
  const server = stubServer([TOKEN_REPLY, { status: 200, body: { links: [] } }])
  const sent = await createRestPayPalHolds(client(server)).sendDisputeMessage({ disputeId: 'PP-D-1', message: 'The scratch is shown in the return photographs.', idempotencyKey: 'proposal-1' })
  expect(sent).toEqual({ ok: true, value: undefined })
  const [call] = server.apiCalls()
  expect(call).toMatchObject({ method: 'POST', path: '/v1/customer/disputes/PP-D-1/send-message', body: { message: 'The scratch is shown in the return photographs.' } })
  expect(call?.headers.get('PayPal-Request-Id')).toBe('proposal-1')
})
