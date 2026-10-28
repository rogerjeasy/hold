// @vitest-environment node
import { findPayPalAccount, inShop, openDemoSession, paypalEvents, registerOwner, rentalDetail, rentalList } from '@hold/db'
import { FAKE_SIGNATURE } from '@hold/paypal'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { beforeAll, describe, expect, it, vi } from 'vitest'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 9).toString('base64')

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: () => Promise.resolve(new Headers({ 'x-forwarded-for': '203.0.113.70' })),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({ getTranslations: () => Promise.resolve((key: string) => key) }))

const mcp = await import('@/app/mcp/route')
const { receiveDemoPayPalEvent } = await import('./demo-webhook')
const { getServices } = await import('./services')

vi.setConfig({ testTimeout: 30_000 })

// Every demo shop shares the demo's one PayPal sandbox app, which has one webhook address for all of them
// (architecture.md section 20.3). Each event names its rental in the order's custom_id, and reaches that demo shop.

const event = (type: string, resource: Record<string, unknown>) => JSON.stringify({ id: `WH-${String(Math.random()).slice(2, 12)}`, event_type: type, resource })
const signed = (signature = FAKE_SIGNATURE) =>
  new Headers({ 'paypal-transmission-id': 'T-1', 'paypal-transmission-time': '2026-10-28T09:00:00Z', 'paypal-transmission-sig': signature, 'paypal-cert-url': 'fake', 'paypal-auth-algo': 'fake', 'content-type': 'application/json' })
const approved = (orderId: string, rentalId: string) => event('CHECKOUT.ORDER.APPROVED', { id: orderId, purchase_units: [{ custom_id: rentalId }] })

let demoShopId: string
let demoSlug: string

beforeAll(async () => {
  const { database, demoSessions } = await getServices()
  const paypal = await demoSessions?.paypal()
  const opened = await openDemoSession(database, {
    owner: { subject: 'owner-hook02', email: 'tomas.hook02@demo.hold.example' },
    staff: { subject: 'staff-hook02', email: 'jonas.hook02@demo.hold.example' },
    slug: 'ribeira-bikes-hook02',
    paypal,
    now: new Date(),
  })
  demoShopId = opened.shopId
  demoSlug = opened.slug
})

// A demo bike booked through Hold's MCP server, its fee approved in PayPal by a renter who never came back.
async function bookedAndApproved(): Promise<{ rentalId: string; orderId: string }> {
  const client = new Client({ name: 'Demo webhook test', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL('https://hold.test/mcp'), { fetch: (url, init) => mcp.POST(new Request(url, init)) }))
  const call = async (name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })).structuredContent as Record<string, unknown>
  const day = (offset: number) => `${new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)}T10:00`
  const free = await call('check_availability', { shop: demoSlug, starts_at: day(2), ends_at: day(4) })
  const [type] = free['item_types'] as { item_type_id: string }[]
  const quote = await call('quote_rental', { shop: demoSlug, starts_at: day(2), ends_at: day(4), items: [{ item_type_id: type?.item_type_id, count: 1 }] })
  const booked = await call('create_booking', { quote_id: quote['quote_id'] })
  await client.close()
  const orderId = String(booked['approval_url']).split('/').at(-1) ?? ''
  const { database, simulatedPayPal } = await getServices()
  simulatedPayPal?.approveOrder(orderId)
  const listed = await inShop(database, { role: 'hold_app', shopId: demoShopId }, (transaction) => rentalList(transaction, new Date()))
  return { rentalId: listed.find((rental) => rental.bookedThrough === 'assistant')?.id ?? '', orderId }
}

const stateOf = async (rentalId: string) => (await inShop((await getServices()).database, { role: 'hold_app', shopId: demoShopId }, (transaction) => rentalDetail(transaction, rentalId, new Date())))?.state

describe('an event of the demo’s shared PayPal app', () => {
  it('books the demo shop’s rental the order names, once PayPal’s signature checks out', async () => {
    const { database } = await getServices()
    const account = await inShop(database, { role: 'hold_app', shopId: demoShopId }, (transaction) => findPayPalAccount(transaction, demoShopId, 'sandbox'))
    expect(account?.webhookId).toMatch(/^FAKE-WEBHOOK-/)
    const { rentalId, orderId } = await bookedAndApproved()

    expect((await receiveDemoPayPalEvent(approved(orderId, rentalId), signed('forged'))).status).toBe(200)
    expect(await stateOf(rentalId)).toBe('pending_payment')
    expect((await receiveDemoPayPalEvent(approved(orderId, rentalId), signed())).status).toBe(200)
    expect(await stateOf(rentalId)).toBe('booked')
  })

  it('is answered and dropped when it names no demo shop’s rental, so the shared address reaches no real shop', async () => {
    const { database } = await getServices()
    const real = await registerOwner(database, { subject: 'owner-real-hook', email: 'owner@real-hook.example', name: 'Ana', language: 'en', shop: { name: 'Real Bikes', timeZone: 'UTC' } })
    const before = (await database.select().from(paypalEvents)).length

    for (const named of [real.shopId, '00000000-0000-4000-8000-000000000000', 'not-a-rental']) {
      expect((await receiveDemoPayPalEvent(approved('ORDER-X', named), signed())).status).toBe(200)
    }
    expect((await receiveDemoPayPalEvent(event('PAYMENT.CAPTURE.COMPLETED', { id: 'CAPTURE-X' }), signed())).status).toBe(200)
    expect((await database.select().from(paypalEvents)).length).toBe(before)
    expect((await receiveDemoPayPalEvent('not json', signed())).status).toBe(400)
  })
})
