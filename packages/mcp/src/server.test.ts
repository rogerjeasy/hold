import { addDays, money, shopTimeText } from '@hold/domain'
import { askForHold, auditLog, beginFeeCapture, beginHoldPlacement, confirmFeeCapture, confirmHoldPlaced, executions, inShop, moneyEvents, quotes, rentalExtensionsOf, rentals, revokeAssistant, saveHoldOrder, savePayPalAccount, sessionByBookingSecret } from '@hold/db'
import type { Scope, Transaction } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import type { TestDatabase } from '@hold/db/testing'
import { readyRentalShop } from '@hold/db/testing/ready-rental'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { TOOL_NAMES } from './catalogue.ts'
import { handleMcpRequest } from './server.ts'
import { readSecret } from './secrets.ts'
import { connectClient, TEST_SECRET, testPorts } from './testing.ts'

// Hold's MCP server driven by the MCP SDK's own client, as any outside assistant would, over streamable HTTP. The
// database is a real PostgreSQL; PayPal is a stand-in that makes approval links and nothing else.

const NOW = new Date()
let database: TestDatabase
let shop: Scope
let typeId: string
let readyRental: () => Promise<{ readonly rentalId: string }>
const logged: Readonly<Record<string, unknown>>[] = []

const act = <Result>(work: (transaction: Transaction) => Promise<Result>) => inShop(database, shop, work)

const connect = (network = '203.0.113.10', name = 'Trip planner') => connectClient(testPorts(database, logged), network, name)

type Structured = Record<string, unknown>
async function call(client: Client, name: string, args: Record<string, unknown>): Promise<{ readonly isError: boolean; readonly data: Structured; readonly content: readonly { readonly type: string }[] }> {
  const result = await client.callTool({ name, arguments: args })
  const content = result.content as readonly { type: string; text?: string }[]
  const data = (result.structuredContent ?? JSON.parse(content[0]?.text ?? '{}')) as Structured
  return { isError: result.isError === true, data, content }
}

const local = (days: number) => `${new Date(NOW.getTime() + days * 86_400_000).toISOString().slice(0, 10)}T10:00`
let nextDay = 10

async function quoteAndBook(client: Client) {
  nextDay += 3
  const quote = await call(client, 'quote_rental', { shop: 'shop-mcp', starts_at: local(nextDay), ends_at: local(nextDay + 2), items: [{ item_type_id: typeId, count: 1 }] })
  const booking = await call(client, 'create_booking', { quote_id: quote.data['quote_id'] })
  return { quote, booking }
}

async function payFee(rentalId: string) {
  const fee = await act((transaction) => beginFeeCapture(transaction, rentalId, new Date()))
  if (!fee.ok) throw new Error(fee.reason)
  const [rental] = await act((transaction) => transaction.select().from(rentals).where(eq(rentals.id, rentalId)))
  await act((transaction) =>
    confirmFeeCapture(transaction, fee.execution.id, { orderId: rental?.paypalFeeOrderId ?? '', captureId: `CAPTURE-${rentalId}`, status: 'completed', amount: money(rental?.feeCents ?? 0, 'EUR'), payer: { payerId: `PAYER-${rentalId}`, email: 'priya@example.com', name: 'Priya' } }, new Date()),
  )
}

// A booking made and paid, with its agent token.
async function paidBooking(client: Client) {
  const { booking } = await quoteAndBook(client)
  const secret = String(booking.data['booking_secret'])
  const rentalId = await rentalOfSecret(secret)
  await payFee(rentalId)
  const paid = await call(client, 'get_booking', { booking_secret: secret })
  return { rentalId, token: String(paid.data['agent_token']), secret, paid }
}

async function rentalOfSecret(secret: string): Promise<string> {
  const session = await sessionByBookingSecret(database, readSecret(TEST_SECRET, 'booking_secret', secret) ?? '')
  return session?.rentalId ?? ''
}

beforeAll(async () => {
  database = await createTestDatabase()
  const ready = await readyRentalShop(database, 'mcp', NOW)
  shop = ready.scope
  typeId = ready.typeId
  readyRental = () => ready.readyRental()
  await act((transaction) => savePayPalAccount(transaction, shop.shopId, 'sandbox', 'hold/paypal/shops/mcp/sandbox'))
})

describe('an MCP client given only the server’s address (X3.1)', () => {
  it('lists the tools, finds the shop, gets a quote, books and receives a PayPal approval link', async () => {
    const client = await connect()
    expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual([...TOOL_NAMES].sort())
    const found = await call(client, 'find_shops', { kind: 'e_bike' })
    expect(found.data['shops']).toEqual([{ shop: 'shop-mcp', name: { merchant_words: 'Shop mcp' }, time_zone: 'UTC', currency: 'EUR', kinds: ['e_bike'] }])
    const prices = await call(client, 'get_damage_prices', { shop: 'shop-mcp' })
    expect(prices.data).toMatchObject({ price_list_version: 1, prices: [{ description: { merchant_words: 'Scratch' }, amount: { cents: 35_00, currency: 'EUR' } }], wear_policy: { merchant_words: 'Scuffs are wear.' } })
    const { quote, booking } = await quoteAndBook(client)
    expect(quote.data).toMatchObject({ fee: { cents: 2 * 40_00, currency: 'EUR' }, hold: { cents: 300_00, currency: 'EUR' }, days: 2, price_list_version: 1, wear_policy_version: 1 })
    expect(booking.isError).toBe(false)
    expect(booking.data).toMatchObject({ status: 'awaiting_payment', fee: { cents: 2 * 40_00 }, hold: { cents: 300_00 } })
    expect(String(booking.data['approval_url'])).toMatch(/^https:\/\/paypal\.example\/checkoutnow\?token=ORDER-/)
    expect(String(booking.data['booking_secret'])).toMatch(/^hbs_/)
    expect(booking.content.map((part) => part.type)).toEqual(['text', 'image'])
  })
})

describe('a person who opens the address in a browser or with curl', () => {
  it('reads how to connect an MCP client, while a client asking for a stream is still answered 405', async () => {
    const ports = testPorts(database, logged)
    // Behind the load balancer the request names the instance, not the address a person reached.
    const read = await handleMcpRequest(new Request('https://localhost:3000/mcp', { headers: { accept: 'text/html,*/*' } }), '', ports, '203.0.113.11', 'https://hold.test/mcp')
    expect(read.status).toBe(200)
    expect(read.headers.get('content-type')).toContain('application/json')
    expect(await read.json()).toMatchObject({
      name: 'hold',
      transport: 'streamable-http',
      address: 'https://hold.test/mcp',
      tools: TOOL_NAMES.length,
      connect: { claudeCode: 'claude mcp add --transport http hold https://hold.test/mcp', cursor: { mcpServers: { hold: { url: 'https://hold.test/mcp' } } }, inspector: 'npx @modelcontextprotocol/inspector' },
    })
    const stream = await handleMcpRequest(new Request('https://hold.test/mcp', { headers: { accept: 'text/event-stream' } }), '', ports, '203.0.113.11')
    expect(stream.status).toBe(405)
    expect(stream.headers.get('allow')).toBe('POST')
    expect((await handleMcpRequest(new Request('https://hold.test/mcp', { method: 'DELETE' }), '', ports, '203.0.113.11')).status).toBe(405)
  })
})

describe('a quote (X3.3)', () => {
  it('equals what the database holds for the quote and the booking made from it', async () => {
    const client = await connect('203.0.113.11')
    const { quote } = await quoteAndBook(client)
    const [stored] = await act((transaction) => transaction.select().from(quotes).where(eq(quotes.id, String(quote.data['quote_id']))))
    const [rental] = await act((transaction) => transaction.select().from(rentals).where(eq(rentals.id, stored?.rentalId ?? '')))
    expect(quote.data['fee']).toEqual({ cents: stored?.feeCents, currency: 'EUR' })
    expect(quote.data['hold']).toEqual({ cents: stored?.holdCents, currency: 'EUR' })
    expect([rental?.feeCents, rental?.holdCents, rental?.bookedThrough]).toEqual([stored?.feeCents, stored?.holdCents, 'assistant'])
  })

  it('cannot be given an amount: the server refuses an argument the tool does not name', async () => {
    const client = await connect('203.0.113.12')
    const refused = await call(client, 'quote_rental', { shop: 'shop-mcp', starts_at: local(40), ends_at: local(41), items: [{ item_type_id: typeId, count: 1 }], fee: { cents: 1, currency: 'EUR' } })
    expect(refused).toMatchObject({ isError: true, data: { error: 'invalid_arguments' } })
  })
})

describe('the booking secret and the agent token (X3.2 in part, X3.5)', () => {
  it('returns no token before the fee is paid, and the token once after PayPal’s capture is on record', async () => {
    const client = await connect('203.0.113.13')
    const { booking } = await quoteAndBook(client)
    const secret = String(booking.data['booking_secret'])
    expect((await call(client, 'get_booking', { booking_secret: secret })).data).toMatchObject({ status: 'awaiting_payment', token: 'not_yet', agent_token: null, rental_id: null })
    const rentalId = await rentalOfSecret(secret)
    await payFee(rentalId)
    const paid = await call(client, 'get_booking', { booking_secret: secret })
    expect(paid.data).toMatchObject({ status: 'paid', token: 'issued_now', rental_id: rentalId, scopes: ['rental', 'hold', 'condition', 'claim', 'record', 'extend'] })
    expect(String(paid.data['agent_token'])).toMatch(/^hat_/)
    expect((await call(client, 'get_booking', { booking_secret: secret })).data).toMatchObject({ status: 'paid', token: 'issued_earlier', agent_token: null })
    const rental = await call(client, 'get_rental', { rental_id: rentalId, agent_token: String(paid.data['agent_token']) })
    expect(rental.data).toMatchObject({ rental_id: rentalId, state: 'booked', shop_name: { merchant_words: 'Shop mcp' } })
  })

  it('refuses a token for one rental on another, and an invented token, with the same answer', async () => {
    const client = await connect('203.0.113.14')
    const first = await paidBooking(client)
    const second = await paidBooking(client)
    expect(await call(client, 'get_hold', { rental_id: second.rentalId, agent_token: first.token })).toMatchObject({ isError: true, data: { error: 'not_authorized' } })
    expect(await call(client, 'get_hold', { rental_id: first.rentalId, agent_token: 'hat_invented' })).toMatchObject({ isError: true, data: { error: 'not_authorized' } })
    expect(await call(client, 'get_hold', { rental_id: first.rentalId, agent_token: second.secret })).toMatchObject({ isError: true, data: { error: 'not_authorized' } })
    expect((await call(client, 'get_hold', { rental_id: first.rentalId, agent_token: first.token })).data).toMatchObject({ state: 'not_requested', agreed_at_booking: { cents: 300_00 } })
  })
})

describe('a claim reply without a mandate (X3.6)', () => {
  it('returns human_confirmation_required with a link, and changes nothing', async () => {
    const client = await connect('203.0.113.15')
    const { rentalId, token } = await paidBooking(client)
    const before = await act((transaction) => transaction.select().from(rentals).where(eq(rentals.id, rentalId)))
    const reply = await call(client, 'submit_claim_reply', { rental_id: rentalId, agent_token: token, decision: 'accept' })
    expect(reply).toMatchObject({ isError: false, data: { status: 'human_confirmation_required', link: 'https://hold.example/for-renters', rental_id: rentalId } })
    expect(await act((transaction) => transaction.select().from(rentals).where(eq(rentals.id, rentalId)))).toEqual(before)
    expect(await act((transaction) => transaction.select().from(executions).where(eq(executions.rentalId, rentalId)))).toHaveLength(1)
  })
})

describe('a disconnected assistant (X3.7)', () => {
  it('is refused at its next call', async () => {
    const client = await connect('203.0.113.16')
    const { rentalId, token } = await paidBooking(client)
    expect((await call(client, 'get_rental', { rental_id: rentalId, agent_token: token })).isError).toBe(false)
    await act((transaction) => revokeAssistant(transaction, rentalId, new Date()))
    expect(await call(client, 'get_rental', { rental_id: rentalId, agent_token: token })).toMatchObject({ isError: true, data: { error: 'not_authorized' } })
  })
})

describe('the audit log', () => {
  it('has one line for every call, with the actor, tool, subject, outcome and duration, and no secret', async () => {
    const client = await connect('203.0.113.17', 'Audit assistant')
    const { rentalId, token, secret } = await paidBooking(client)
    await call(client, 'get_hold', { rental_id: rentalId, agent_token: token })
    const lines = await act((transaction) => transaction.select().from(auditLog).where(and(eq(auditLog.subjectId, rentalId))))
    expect(lines.map((line) => [line.actorKind, line.action, line.detail['outcome']])).toEqual([
      ['public_agent', 'assistant.create_booking', 'ok'],
      ['public_agent', 'assistant.get_booking', 'ok'],
      ['renter_agent', 'assistant.get_hold', 'ok'],
    ])
    expect(lines[2]?.detail).toMatchObject({ tier: 'read', client: 'Audit assistant' })
    expect(typeof lines[2]?.detail['durationMs']).toBe('number')
    expect(JSON.stringify(lines)).not.toContain(token)
    expect(JSON.stringify(lines)).not.toContain(secret)
    await call(client, 'find_shops', {})
    expect(logged.at(-1)).toMatchObject({ event: 'assistant.call', tool: 'find_shops', outcome: 'ok' })
  })
})

describe('money', () => {
  it('no tool, called on a rental whose hold is placed, captures the hold or moves money', async () => {
    const client = await connect('203.0.113.20')
    const { rentalId, token } = await paidBooking(client)
    await act((transaction) => askForHold(transaction, rentalId, new Date()))
    await act((transaction) => saveHoldOrder(transaction, rentalId, `HOLD-${rentalId}`))
    const placement = await act((transaction) => beginHoldPlacement(transaction, rentalId, new Date()))
    if (!placement.ok) throw new Error(placement.reason)
    await act((transaction) => confirmHoldPlaced(transaction, placement.execution.id, { authorizationId: `AUTH-${rentalId}`, status: 'created', amount: money(300_00, 'EUR'), createdAt: new Date(), expiresAt: addDays(new Date(), 29) }, new Date()))
    const before = await act((transaction) => transaction.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId)))
    for (const name of TOOL_NAMES) {
      await call(client, name, { rental_id: rentalId, agent_token: token, decision: 'accept', comment: 'Fine.' })
    }
    const captures = await act((transaction) => transaction.select().from(executions).where(and(eq(executions.rentalId, rentalId), eq(executions.action, 'capture'))))
    expect(captures).toEqual([])
    expect(await act((transaction) => transaction.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId)))).toEqual(before)
    expect((await call(client, 'get_hold', { rental_id: rentalId, agent_token: token })).data).toMatchObject({ state: 'placed', amount: { cents: 300_00 } })
  })

  it('prices more days for the rental the token names and returns a PayPal link the person approves, moving no money', async () => {
    const client = await connect('203.0.113.22')
    const { rentalId, token } = await paidBooking(client)
    await act((transaction) => askForHold(transaction, rentalId, new Date()))
    await act((transaction) => saveHoldOrder(transaction, rentalId, `HOLD-${rentalId}`))
    const placement = await act((transaction) => beginHoldPlacement(transaction, rentalId, new Date()))
    if (!placement.ok) throw new Error(placement.reason)
    const endsAt = (await act((transaction) => transaction.select({ endsAt: rentals.endsAt }).from(rentals).where(eq(rentals.id, rentalId))))[0]?.endsAt ?? new Date()
    // Placed as the rental began, as at a real pickup, so the hold has most of its 29 days left.
    await act((transaction) => confirmHoldPlaced(transaction, placement.execution.id, { authorizationId: `AUTH-${rentalId}`, status: 'created', amount: money(300_00, 'EUR'), createdAt: new Date(), expiresAt: addDays(endsAt, 20) }, new Date()))
    // The handover itself is not this test's business.
    await act((transaction) => transaction.update(rentals).set({ state: 'out' }).where(eq(rentals.id, rentalId)))
    const before = await act((transaction) => transaction.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId)))
    const asked = await call(client, 'request_extension', { rental_id: rentalId, agent_token: token, ends_at: shopTimeText('UTC', new Date(endsAt.getTime() + 24 * 3_600_000)) })
    expect(asked.data).toMatchObject({ rental_id: rentalId, status: 'awaiting_approval', extra_days: 1, fee: { cents: 40_00, currency: 'EUR' }, refused_because: null })
    expect(String(asked.data['approval_url'])).toMatch(/^https:\/\/paypal\.example\//)
    expect((await act((transaction) => rentalExtensionsOf(transaction, rentalId)))[0]).toMatchObject({ state: 'ordered', askedThrough: 'assistant' })
    const refused = await call(client, 'request_extension', { rental_id: rentalId, agent_token: token, ends_at: shopTimeText('UTC', new Date(endsAt.getTime() + 20 * 24 * 3_600_000)) })
    expect(refused.data).toMatchObject({ status: 'refused', refused_because: 'too_many_days', max_days: 7, approval_url: null })
    expect(await act((transaction) => transaction.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId)))).toEqual(before)
  })

  it('reads a ready rental of another assistant-less booking as nothing it can reach', async () => {
    const client = await connect('203.0.113.21')
    const { rentalId: other } = await readyRental()
    const { token } = await paidBooking(client)
    expect(await call(client, 'get_hold', { rental_id: other, agent_token: token })).toMatchObject({ isError: true, data: { error: 'not_authorized' } })
  })
})

// Last: the bookings these make fill the shop's allowance of unpaid bookings from assistants.
describe('limits', () => {
  it('lets one caller make only a few bookings in fifteen minutes', async () => {
    const client = await connect('203.0.113.18')
    for (let index = 0; index < 3; index += 1) expect((await quoteAndBook(client)).booking.isError).toBe(false)
    expect((await quoteAndBook(client)).booking).toMatchObject({ isError: true, data: { error: 'caller_busy' } })
  })

  it('slows a network that calls the public tools too often', async () => {
    const client = await connect('203.0.113.19')
    let last = await call(client, 'find_shops', {})
    for (let index = 0; index < 60; index += 1) last = await call(client, 'find_shops', {})
    expect(last).toMatchObject({ isError: true, data: { error: 'rate_limited' } })
  })
})
