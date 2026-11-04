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

// Disputes v1 provide-evidence: a multipart form with the evidence as JSON in "input" and the document in
// "evidence-file". Confirmed in the sandbox on 28 October 2026 (tech-stack.md section 16, item 6): PayPal refused the
// evidence type OTHER for a dispute that the item was not received, with EVIDENCE_TYPE_IS_NOT_ALLOWED, and took
// PROOF_OF_FULFILLMENT with the PDF. So the dispute is read back first, and its reason chooses the type.
const disputeOf = (reason: string) => ({ status: 200, body: { dispute_id: 'PP-D-1', status: 'WAITING_FOR_SELLER_RESPONSE', reason } })

it('answers a dispute that the rental was not received with proof of fulfilment and the evidence pack as a PDF', async () => {
  const server = stubServer([TOKEN_REPLY, disputeOf('MERCHANDISE_OR_SERVICE_NOT_RECEIVED'), { status: 200, body: { links: [] } }])
  const pdf = new TextEncoder().encode('%PDF-1.7 the evidence pack')
  const sent = await createRestPayPalHolds(client(server)).provideDisputeEvidence({ disputeId: 'PP-D-1', notes: 'The renter collected the bike; the handover photographs are attached.', document: { fileName: 'hold-record-v2.pdf', bytes: pdf }, idempotencyKey: 'proposal-1' })

  expect(sent).toEqual({ ok: true, value: undefined })
  const [read, call] = server.apiCalls()
  expect(read).toMatchObject({ method: 'GET', path: '/v1/customer/disputes/PP-D-1' })
  expect(call).toMatchObject({ method: 'POST', path: '/v1/customer/disputes/PP-D-1/provide-evidence' })
  expect(call?.headers.get('PayPal-Request-Id')).toBe('proposal-1')
  const form = call?.body as FormData
  const input = form.get('input') as Blob
  expect(input.type).toBe('application/json')
  expect(JSON.parse(await input.text())).toEqual({ evidences: [{ evidence_type: 'PROOF_OF_FULFILLMENT', notes: 'The renter collected the bike; the handover photographs are attached.' }] })
  const file = form.get('evidence-file') as File
  expect(file.name).toBe('hold-record-v2.pdf')
  expect(file.type).toBe('application/pdf')
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(pdf)
})

// Only the type above has been seen accepted. For any other reason Hold sends OTHER, and a refusal fails the approved
// answer where the owner sees it, rather than Hold guessing another type.
it('answers a dispute for any other reason with the evidence type other', async () => {
  const server = stubServer([TOKEN_REPLY, disputeOf('MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED'), { status: 200, body: { links: [] } }])
  await createRestPayPalHolds(client(server)).provideDisputeEvidence({ disputeId: 'PP-D-1', notes: 'Notes.', document: undefined, idempotencyKey: 'proposal-3' })
  const input = (server.apiCalls()[1]?.body as FormData).get('input') as Blob
  expect(JSON.parse(await input.text())).toMatchObject({ evidences: [{ evidence_type: 'OTHER' }] })
})

// A dispute names what PayPal asks of the seller: evidences with the source REQUESTED_FROM_SELLER, in the shape of
// PayPal's dispute details (Disputes v1). Hold answers with the type it asked for that best fits a rental's record.
const asking = (reason: string, requested: readonly string[]) => ({
  status: 200,
  body: {
    dispute_id: 'PP-D-1',
    status: 'WAITING_FOR_SELLER_RESPONSE',
    reason,
    evidences: [
      { evidence_type: 'PROOF_OF_REFUND', source: 'SUBMITTED_BY_BUYER', date: '2026-11-01T09:00:00.000Z' },
      ...requested.map((type) => ({ evidence_type: type, source: 'REQUESTED_FROM_SELLER' })),
    ],
  },
})
const evidenceTypeSent = async (reply: ReturnType<typeof asking>) => {
  const server = stubServer([TOKEN_REPLY, reply, { status: 200, body: { links: [] } }])
  await createRestPayPalHolds(client(server)).provideDisputeEvidence({ disputeId: 'PP-D-1', notes: 'Notes.', document: undefined, idempotencyKey: 'proposal-4' })
  const input = (server.apiCalls()[1]?.body as FormData).get('input') as Blob
  return (JSON.parse(await input.text()) as { evidences: { evidence_type: string }[] }).evidences[0]?.evidence_type
}

it('answers with proof of damage when PayPal asks the seller for it, before anything else a damage claim could send', async () => {
  expect(await evidenceTypeSent(asking('MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED', ['OTHER', 'RETURN_POLICY', 'PROOF_OF_DAMAGE']))).toBe('PROOF_OF_DAMAGE')
})

it('answers with the rental contract, the item’s description or the return policy, in that order, when PayPal asks for one of them', async () => {
  expect(await evidenceTypeSent(asking('INCORRECT_AMOUNT', ['RETURN_POLICY', 'COPY_OF_CONTRACT']))).toBe('COPY_OF_CONTRACT')
  expect(await evidenceTypeSent(asking('INCORRECT_AMOUNT', ['RETURN_POLICY', 'ITEM_DESCRIPTION']))).toBe('ITEM_DESCRIPTION')
  expect(await evidenceTypeSent(asking('INCORRECT_AMOUNT', ['RETURN_POLICY']))).toBe('RETURN_POLICY')
})

it('never sends other when PayPal asks for something else, as for an item not received', async () => {
  expect(await evidenceTypeSent(asking('MERCHANDISE_OR_SERVICE_NOT_RECEIVED', ['PROOF_OF_FULFILLMENT']))).toBe('PROOF_OF_FULFILLMENT')
  expect(await evidenceTypeSent(asking('MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED', ['OTHER']))).toBe('OTHER')
})

it('falls back to the reason’s own type when PayPal asks for none a rental’s record can be', async () => {
  expect(await evidenceTypeSent(asking('MERCHANDISE_OR_SERVICE_NOT_RECEIVED', ['PROOF_OF_REFUND']))).toBe('PROOF_OF_FULFILLMENT')
  expect(await evidenceTypeSent(asking('MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED', []))).toBe('OTHER')
})

it('answers with notes alone when there is no evidence pack yet', async () => {
  const server = stubServer([TOKEN_REPLY, disputeOf('MERCHANDISE_OR_SERVICE_NOT_RECEIVED'), { status: 200, body: { links: [] } }])
  await createRestPayPalHolds(client(server)).provideDisputeEvidence({ disputeId: 'PP-D-1', notes: 'Notes only.', document: undefined, idempotencyKey: 'proposal-2' })
  const form = server.apiCalls()[1]?.body as FormData
  expect(form.get('evidence-file')).toBeNull()
})
