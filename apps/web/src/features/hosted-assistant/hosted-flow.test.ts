// @vitest-environment node
import { auditLog, inShop, itemCatalog, openDemoSession, registerOwner, retireDemoSession, takeRateToken } from '@hold/db'
import { utcDay } from '@hold/domain'
import { beforeAll, describe, expect, it, vi } from 'vitest'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 9).toString('base64')

const jar = new Map<string, string>()
const forwarded = { value: '203.0.113.120' }
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

const route = await import('@/app/mcp/route')
const { askAssistant } = await import('./actions')
const shop = await import('@/features/shop/actions')
const items = await import('@/features/items/actions')
const { getServices } = await import('@/server/services')
const { form, signIn } = await import('@/test/shop-session')
const { writeDemoSession } = await import('@/features/auth/session-cookies')
const { HOSTED_QUESTION_LIMITS } = await import('./limits')

vi.setConfig({ testTimeout: 30_000 })

// The hosted assistant reaches Hold only through the app's /mcp address, as any outside client would. Here the address
// is answered by the route itself, in this process.
const realFetch = globalThis.fetch
vi.stubGlobal('fetch', (url: string | URL | Request, init?: RequestInit) => {
  const address = url instanceof Request ? url.url : String(url)
  return new URL(address).pathname === '/mcp' ? route.POST(new Request(address, init)) : realFetch(url, init)
})

const OWNER = 'owner@hosted.example'
let shopId: string

const ask = (conversation: unknown, text: string) => askAssistant(null, form({ conversation: JSON.stringify(conversation), text, locale: 'en' }))

beforeAll(async () => {
  const { database } = await getServices()
  const subject = await signIn(jar, OWNER, 'passkey')
  shopId = (await registerOwner(database, { subject, email: OWNER, name: 'Ana', language: 'en', shop: { name: 'Hosted Bikes', timeZone: 'UTC' } })).shopId
  expect(await shop.publishPrices(null, form({ currency: 'EUR', threshold: '', wearPolicy: 'Scuffs are wear.', description: 'Scratch', category: 'damage', amount: '35', locale: 'en' }))).toMatchObject({ ok: true })
  expect(await shop.connectPayPal(null, form({ clientId: 'sandbox-client-id', clientSecret: 'sandbox-client-secret', locale: 'en' }))).toMatchObject({ ok: true })
  expect(await items.saveItemType(null, form({ itemTypeId: '', name: 'City e-bike', category: 'e_bike', value: '2400', hold: '300', dayRate: '40', viewLabel: 'Frame', viewOutline: 'whole_side', viewRequired: 'yes', locale: 'en' }))).toMatchObject({ ok: true })
  const typeId = (await inShop(database, { role: 'hold_app', shopId }, itemCatalog)).types[0]?.id ?? ''
  expect(await items.addItems(null, form({ itemTypeId: typeId, count: '2', size: '', serial: '', locale: 'en' }))).toMatchObject({ ok: true })
  jar.clear()
})

describe('the hosted assistant’s page', () => {
  it('books through Hold’s own MCP server, says it is simulated, and hands over PayPal’s link as a QR code', async () => {
    const quoted = await ask([], 'Book me an e-bike for three days.')
    if (!quoted.ok) throw new Error(JSON.stringify(quoted))
    expect(quoted.value).toMatchObject({ simulated: true, stopped: 'done', approvalUrl: null })
    expect(quoted.value.reply).toContain('€120.00')
    const booked = await ask(quoted.value.conversation, 'Yes, book it.')
    if (!booked.ok) throw new Error(JSON.stringify(booked))
    expect(booked.value.approvalUrl).toMatch(/\/simulated-paypal\/FAKE-ORDER-/)
    expect(booked.value.approvalQr).toMatch(/^<svg/)
    // Each call went through the gateway into the shop's audit log, under the name the client declared.
    const { database } = await getServices()
    const lines = await inShop(database, { role: 'hold_app', shopId }, (transaction) => transaction.select().from(auditLog))
    const calls = lines.filter((line) => line.action.startsWith('assistant.'))
    expect(calls.map((line) => line.action)).toEqual(['assistant.check_availability', 'assistant.get_damage_prices', 'assistant.quote_rental', 'assistant.create_booking'])
    expect(calls.every((line) => line.detail['client'] === 'Hold hosted assistant (demonstration)')).toBe(true)
  })

  it('rents from the judge’s own demo shop, which no assistant can find, when this browser started a demo', async () => {
    forwarded.value = '203.0.113.121'
    const { database } = await getServices()
    const demo = await openDemoSession(database, {
      owner: { subject: 'owner-hosted1', email: 'tomas.hosted1@demo.hold.example' },
      staff: { subject: 'staff-hosted1', email: 'jonas.hosted1@demo.hold.example' },
      slug: 'ribeira-bikes-hosted1',
      paypal: { credentialReference: 'hold/paypal/shops/demo/sandbox', mode: 'sandbox' },
      now: new Date(),
    })
    const password = 'x'.repeat(24)
    await writeDemoSession({ shopId: demo.shopId, owner: { email: 'tomas.hosted1@demo.hold.example', password }, staff: { email: 'jonas.hosted1@demo.hold.example', password } })

    const quoted = await ask([], 'Book me a bike for three days.')
    if (!quoted.ok) throw new Error(JSON.stringify(quoted))
    expect(quoted.value.reply).toContain('City bike')
    const booked = await ask(quoted.value.conversation, 'Yes, book it.')
    if (!booked.ok) throw new Error(JSON.stringify(booked))
    expect(booked.value.approvalUrl).toMatch(/\/simulated-paypal\/FAKE-ORDER-/)
    const lines = await inShop(database, { role: 'hold_app', shopId: demo.shopId }, (transaction) => transaction.select().from(auditLog))
    expect(lines.map((line) => line.action)).toContain('assistant.create_booking')
    jar.clear()
  })

  it('refuses a conversation that is not one, and a network that asks too often', async () => {
    forwarded.value = '198.51.100.200'
    expect(await askAssistant(null, form({ conversation: '{"role":"system"}', text: 'Hi', locale: 'en' }))).toMatchObject({ ok: false, failure: 'invalid' })
    let last: unknown
    for (let index = 0; index < 20; index += 1) last = await askAssistant(null, form({ conversation: 'not json', text: 'Hi', locale: 'en' }))
    expect(last).toEqual({ ok: false, failure: 'rate_limited' })
  })

  it('no longer names the judge’s demo shop to the assistant once the demo was retired', async () => {
    forwarded.value = '203.0.113.122'
    const { database } = await getServices()
    const demo = await openDemoSession(database, {
      owner: { subject: 'owner-hosted2', email: 'tomas.hosted2@demo.hold.example' },
      staff: { subject: 'staff-hosted2', email: 'jonas.hosted2@demo.hold.example' },
      slug: 'ribeira-bikes-hosted2',
      paypal: { credentialReference: 'hold/paypal/shops/demo/sandbox', mode: 'sandbox' },
      now: new Date(),
    })
    const password = 'x'.repeat(24)
    await writeDemoSession({ shopId: demo.shopId, owner: { email: 'tomas.hosted2@demo.hold.example', password }, staff: { email: 'jonas.hosted2@demo.hold.example', password } })
    const later = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000)
    await retireDemoSession(database, { shopId: demo.shopId, cutoff: new Date(Date.now() + 24 * 60 * 60 * 1000), now: later })

    const answered = await ask([], 'Book me a bike for three days.')
    if (!answered.ok) throw new Error(JSON.stringify(answered))
    expect(answered.value.toolCalls.map((call) => call.name)).not.toContain('get_shop')
    const lines = await inShop(database, { role: 'hold_app', shopId: demo.shopId }, (transaction) => transaction.select().from(auditLog))
    expect(lines.map((line) => line.action).filter((action) => action.startsWith('assistant.'))).toEqual([])
    jar.clear()
  })

  // Sized so that a day of questions cannot spend the account's daily Claude tokens (packages/domain demo-limits.ts).
  it('says plainly once the day’s questions from every network are spent', async () => {
    forwarded.value = '198.51.100.201'
    const { database } = await getServices()
    expect(HOSTED_QUESTION_LIMITS.perDay).toEqual({ name: 'hosted-assistant-day', max: 15, windowSeconds: 24 * 60 * 60 })
    for (let index = 0; index < HOSTED_QUESTION_LIMITS.perDay.max; index += 1) await takeRateToken(database, HOSTED_QUESTION_LIMITS.perDay, utcDay(new Date()))

    expect(await ask([], 'Book me an e-bike.')).toEqual({ ok: false, failure: 'daily_cap' })
    forwarded.value = '198.51.100.202'
    expect(await ask([], 'Book me an e-bike.')).toEqual({ ok: false, failure: 'daily_cap' })
  })
})
