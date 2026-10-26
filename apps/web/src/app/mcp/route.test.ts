// @vitest-environment node
import { findPayPalAccount, inShop, itemCatalog, registerOwner, rentalList } from '@hold/db'
import { LANGUAGES } from '@hold/mcp'
import { FAKE_SIGNATURE } from '@hold/paypal'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { beforeAll, describe, expect, it, vi } from 'vitest'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 9).toString('base64')

const jar = new Map<string, string>()
const forwarded = { value: '203.0.113.60' }
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
      set: (name: string, value: string) => jar.set(name, value),
      delete: (name: string) => jar.delete(name),
    }),
  headers: () => Promise.resolve(new Headers({ 'x-forwarded-for': forwarded.value })),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({ getTranslations: () => Promise.resolve((key: string) => key) }))

const route = await import('./route')
const { receivePayPalEvent } = await import('@/server/paypal-webhook')
const renter = await import('@/features/renter/actions')
const shop = await import('@/features/shop/actions')
const items = await import('@/features/items/actions')
const { getServices } = await import('@/server/services')
const { form, signIn } = await import('@/test/shop-session')
const { routing } = await import('@/i18n/routing')

vi.setConfig({ testTimeout: 30_000 })

// Hold's MCP server through the app's own /mcp route, with the test environment's PayPal: an outside MCP client books,
// the person approves in the simulated PayPal, and the assistant receives its token.

const OWNER = 'owner@assistant.example'
let shopId: string
let accountId: string
let typeId: string

async function connect(name = 'Outside assistant'): Promise<Client> {
  const client = new Client({ name, version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL('https://hold.test/mcp'), { fetch: (url, init) => route.POST(new Request(url, init)) }))
  return client
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await client.callTool({ name, arguments: args })
  if (result.isError === true) throw new Error(JSON.stringify(result.content))
  return result.structuredContent ?? {}
}

const day = (offset: number) => `${new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)}T10:00`

async function book(client: Client, offset: number) {
  const quote = await call(client, 'quote_rental', { shop: 'assistant-bikes', starts_at: day(offset), ends_at: day(offset + 3), items: [{ item_type_id: typeId, count: 1 }] })
  const booking = await call(client, 'create_booking', { quote_id: quote['quote_id'] })
  const orderId = new URL(String(booking['approval_url'])).pathname.split('/').at(-1) ?? ''
  return { quote, booking, orderId, secret: String(booking['booking_secret']) }
}

beforeAll(async () => {
  const { database } = await getServices()
  const subject = await signIn(jar, OWNER, 'passkey')
  shopId = (await registerOwner(database, { subject, email: OWNER, name: 'Ana', language: 'en', shop: { name: 'Assistant Bikes', timeZone: 'UTC' } })).shopId
  expect(await shop.publishPrices(null, form({ currency: 'EUR', threshold: '', wearPolicy: 'Scuffs are wear.', description: 'Scratch', category: 'damage', amount: '35', locale: 'en' }))).toMatchObject({ ok: true })
  expect(await shop.connectPayPal(null, form({ clientId: 'sandbox-client-id', clientSecret: 'sandbox-client-secret', locale: 'en' }))).toMatchObject({ ok: true })
  expect(await items.saveItemType(null, form({ itemTypeId: '', name: 'City e-bike', category: 'e_bike', value: '2400', hold: '300', dayRate: '40', viewLabel: 'Frame', viewOutline: 'whole_side', viewRequired: 'yes', locale: 'en' }))).toMatchObject({ ok: true })
  typeId = (await inShop(database, { role: 'hold_app', shopId }, itemCatalog)).types[0]?.id ?? ''
  expect(await items.addItems(null, form({ itemTypeId: typeId, count: '4', size: '', serial: '', locale: 'en' }))).toMatchObject({ ok: true })
  accountId = (await inShop(database, { role: 'hold_app', shopId }, (transaction) => findPayPalAccount(transaction, shopId, 'sandbox')))?.id ?? ''
  jar.clear()
})

describe('/mcp', () => {
  it('books through the app’s own PayPal path, for exactly the quoted fee (X3.1, X3.3)', async () => {
    const client = await connect()
    const { quote, booking, orderId } = await book(client, 20)
    expect(booking['fee']).toEqual(quote['fee'])
    expect(booking['approval_url']).toMatch(/\/simulated-paypal\/FAKE-ORDER-/)
    const { simulatedPayPal } = await getServices()
    expect(simulatedPayPal?.orderLinks(orderId)?.amount).toEqual({ cents: 3 * 40_00, currency: 'EUR' })
    // PayPal returns the person to their own rental link, which the assistant never sees.
    expect(simulatedPayPal?.orderLinks(orderId)?.returnUrl).toMatch(/\/r\/[A-Za-z0-9_-]{65}\/paid$/)
    expect(JSON.stringify(booking)).not.toContain(simulatedPayPal?.orderLinks(orderId)?.returnUrl.split('/r/')[1]?.slice(0, 65) ?? 'none')
  })

  it('gives the token once the person approves and comes back, and the rental shows in the staff view (X3.2)', async () => {
    const client = await connect()
    const { orderId, secret } = await book(client, 30)
    const { simulatedPayPal, database } = await getServices()
    simulatedPayPal?.approveOrder(orderId)
    const token = new URL(simulatedPayPal?.orderLinks(orderId)?.returnUrl ?? '').pathname.split('/')[2] ?? ''
    expect(await renter.confirmFee(null, form({ token, orderId, locale: 'en' }))).toEqual({ ok: true, value: { state: 'booked' } })
    const paid = await call(client, 'get_booking', { booking_secret: secret })
    expect(paid).toMatchObject({ status: 'paid', token: 'issued_now' })
    const listed = await inShop(database, { role: 'hold_app', shopId }, (transaction) => rentalList(transaction, new Date()))
    expect(listed.find((rental) => rental.id === paid['rental_id'])).toMatchObject({ state: 'booked', bookedThrough: 'assistant', feeCents: 3 * 40_00 })
  })

  it('has the fee captured from PayPal’s approval event alone when the person never comes back (X3.9)', async () => {
    const client = await connect()
    const { orderId, secret } = await book(client, 40)
    ;(await getServices()).simulatedPayPal?.approveOrder(orderId)
    expect(await call(client, 'get_booking', { booking_secret: secret })).toMatchObject({ status: 'awaiting_payment', agent_token: null })
    const event = JSON.stringify({ id: `WH-${orderId}`, event_type: 'CHECKOUT.ORDER.APPROVED', resource: { id: orderId } })
    const headers = new Headers({ 'paypal-transmission-id': 'T-1', 'paypal-transmission-time': new Date().toISOString(), 'paypal-transmission-sig': FAKE_SIGNATURE, 'paypal-cert-url': 'fake', 'paypal-auth-algo': 'fake' })
    expect((await receivePayPalEvent(accountId, event, headers)).status).toBe(200)
    const paid = await call(client, 'get_booking', { booking_secret: secret })
    expect(paid).toMatchObject({ status: 'paid', token: 'issued_now' })
    expect(String(paid['agent_token'])).toMatch(/^hat_/)
  })

  it('answers only POST, and refuses a body over 64 KB before it is read as a call', async () => {
    expect((await route.GET(new Request('https://hold.test/mcp'))).status).toBe(405)
    const large = await route.POST(new Request('https://hold.test/mcp', { method: 'POST', body: 'x'.repeat(64 * 1024 + 1), headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' } }))
    expect(large.status).toBe(413)
  })

  it('offers bookings in the languages the renter pages are served in', () => {
    expect([...LANGUAGES].sort()).toEqual([...routing.locales].sort())
  })
})
