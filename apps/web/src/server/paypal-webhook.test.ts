// @vitest-environment node
import { findPayPalAccount, inShop, itemCatalog, paypalEvents, registerOwner, rentalDetail } from '@hold/db'
import { FAKE_SIGNATURE } from '@hold/paypal'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 9).toString('base64')

const jar = new Map<string, string>()
// The network a delivery comes from, as the load balancer names it. PayPal's own, unless a test says otherwise.
const PAYPAL_NETWORK = '203.0.113.50'
let caller = PAYPAL_NETWORK
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
      set: (name: string, value: string) => jar.set(name, value),
      delete: (name: string) => jar.delete(name),
    }),
  headers: () => Promise.resolve(new Headers({ 'x-forwarded-for': caller })),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({ getTranslations: () => Promise.resolve((key: string) => key) }))

const { FORGED_DELIVERIES, receivePayPalEvent } = await import('./paypal-webhook')
const shop = await import('@/features/shop/actions')
const items = await import('@/features/items/actions')
const rentals = await import('@/features/rentals/actions')
const renter = await import('@/features/renter/actions')
const { getServices } = await import('./services')
const { form, signIn } = await import('@/test/shop-session')

vi.setConfig({ testTimeout: 30_000 })

const OWNER = 'owner@webhooks.example'
let shopId: string
let accountId: string

const event = (type: string, resource: Record<string, unknown>, id = `WH-${String(Math.random()).slice(2, 12)}`) => JSON.stringify({ id, event_type: type, resource })
const signed = (signature = FAKE_SIGNATURE) =>
  new Headers({ 'paypal-transmission-id': 'T-1', 'paypal-transmission-time': '2026-10-15T09:00:00Z', 'paypal-transmission-sig': signature, 'paypal-cert-url': 'fake', 'paypal-auth-algo': 'fake', 'content-type': 'application/json' })

const day = (offset: number) => `${new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)}T10:00`

// A booking whose renter approved the fee in PayPal and then closed the page, never coming back to Hold.
async function approvedButGone(offset: number): Promise<{ rentalId: string; orderId: string }> {
  await signIn(jar, OWNER, 'email_code')
  const typeId = (await inShop((await getServices()).database, { role: 'hold_app', shopId }, itemCatalog)).types[0]?.id ?? ''
  const booked = await rentals.bookRental(null, form({ startsAt: day(offset), endsAt: day(offset + 1), itemTypeId: typeId, count: '1', contactName: '', contactEmail: '', language: 'en', locale: 'en' }))
  if (!booked.ok) throw new Error(JSON.stringify(booked))
  const shown = await rentals.showRenterLink(null, form({ rentalId: booked.value.rentalId, locale: 'en' }))
  if (!shown.ok) throw new Error(JSON.stringify(shown))
  jar.clear()
  const token = shown.value.url.split('/r/')[1] ?? ''
  const started = await renter.payFee(null, form({ token, locale: 'en' }))
  if (!started.ok) throw new Error(JSON.stringify(started))
  const orderId = started.value.approvalUrl.split('/').at(-1) ?? ''
  ;(await getServices()).simulatedPayPal?.approveOrder(orderId)
  return { rentalId: booked.value.rentalId, orderId }
}

const storedWithId = async (paypalEventId: string) => (await (await getServices()).database.select().from(paypalEvents)).filter((row) => row.paypalEventId === paypalEventId).length

const stateOf = async (rentalId: string) => (await inShop((await getServices()).database, { role: 'hold_app', shopId }, (transaction) => rentalDetail(transaction, rentalId, new Date())))?.state

beforeAll(async () => {
  const { database } = await getServices()
  const subject = await signIn(jar, OWNER, 'passkey')
  shopId = (await registerOwner(database, { subject, email: OWNER, name: 'Ana', language: 'en', shop: { name: 'Webhook Bikes', timeZone: 'UTC' } })).shopId
  expect(await shop.publishPrices(null, form({ currency: 'EUR', threshold: '', wearPolicy: 'Wear.', description: 'Scratch', category: 'damage', amount: '35', locale: 'en' }))).toMatchObject({ ok: true })
  expect(await shop.connectPayPal(null, form({ clientId: 'sandbox-client-id', clientSecret: 'sandbox-client-secret', locale: 'en' }))).toMatchObject({ ok: true })
  expect(await items.saveItemType(null, form({ itemTypeId: '', name: 'E-bike', category: 'e_bike', value: '2400', hold: '300', dayRate: '40', viewLabel: 'Frame', viewOutline: 'whole_side', viewRequired: 'yes', locale: 'en' }))).toMatchObject({ ok: true })
  const typeId = (await inShop(database, { role: 'hold_app', shopId }, itemCatalog)).types[0]?.id ?? ''
  expect(await items.addItems(null, form({ itemTypeId: typeId, count: '5', size: '', serial: '', locale: 'en' }))).toMatchObject({ ok: true })
  accountId = (await inShop(database, { role: 'hold_app', shopId }, (transaction) => findPayPalAccount(transaction, shopId, 'sandbox')))?.id ?? ''
})

beforeEach(() => {
  jar.clear()
})

describe('connecting PayPal', () => {
  it('subscribes the shop’s own webhook address in its account', async () => {
    const { database } = await getServices()
    const account = await inShop(database, { role: 'hold_app', shopId }, (transaction) => findPayPalAccount(transaction, shopId, 'sandbox'))
    expect(account?.webhookId).toMatch(/^FAKE-WEBHOOK-/)
  })
})

describe('an event PayPal delivers', () => {
  it('books a rental whose renter approved the fee and never came back', async () => {
    const { rentalId, orderId } = await approvedButGone(3)
    const answer = await receivePayPalEvent(accountId, event('CHECKOUT.ORDER.APPROVED', { id: orderId }), signed())
    expect(answer.status).toBe(200)
    expect(await stateOf(rentalId)).toBe('booked')
  })

  it('is answered 200 again when PayPal repeats it, and stored once', async () => {
    const body = event('CUSTOMER.DISPUTE.CREATED', { id: 'PP-D-1' }, 'WH-REPEATED')
    expect((await receivePayPalEvent(accountId, body, signed())).status).toBe(200)
    expect((await receivePayPalEvent(accountId, body, signed())).status).toBe(200)
    const { database } = await getServices()
    expect((await database.select().from(paypalEvents)).filter((row) => row.paypalEventId === 'WH-REPEATED')).toHaveLength(1)
  })

  it('is refused and never stored when its signature is not PayPal’s', async () => {
    const { rentalId, orderId } = await approvedButGone(6)
    const forged = event('CHECKOUT.ORDER.APPROVED', { id: orderId }, 'WH-FORGED')
    expect((await receivePayPalEvent(accountId, forged, signed('forged'))).status).toBe(401)
    expect(await stateOf(rentalId)).toBe('pending_payment')
    expect(await storedWithId('WH-FORGED')).toBe(0)
  })

  it('cannot be kept out by a forged post that took its event id first', async () => {
    const { rentalId, orderId } = await approvedButGone(9)
    const body = event('CHECKOUT.ORDER.APPROVED', { id: orderId }, 'WH-SQUATTED')
    expect((await receivePayPalEvent(accountId, body, signed('forged'))).status).toBe(401)
    expect((await receivePayPalEvent(accountId, body, signed())).status).toBe(200)
    expect(await stateOf(rentalId)).toBe('booked')
    expect(await storedWithId('WH-SQUATTED')).toBe(1)
  })

  it('is answered 503 and stored nowhere when PayPal cannot say whether it signed it, so PayPal sends it again', async () => {
    const { simulatedPayPal } = await getServices()
    if (simulatedPayPal === undefined) throw new Error('No simulated PayPal.')
    const down = vi.spyOn(simulatedPayPal, 'verifyWebhook').mockResolvedValue({ ok: false, error: { kind: 'unavailable', issue: undefined, description: undefined, debugId: undefined } })
    expect((await receivePayPalEvent(accountId, event('CUSTOMER.DISPUTE.CREATED', { id: 'PP-D-2' }, 'WH-UNCHECKED'), signed())).status).toBe(503)
    down.mockRestore()
    expect(await storedWithId('WH-UNCHECKED')).toBe(0)
  })

  it('is refused for an address that names no account, and for a body that is not an event', async () => {
    expect((await receivePayPalEvent('00000000-0000-4000-8000-000000000000', event('CHECKOUT.ORDER.APPROVED', { id: 'X' }), signed())).status).toBe(404)
    expect((await receivePayPalEvent(accountId, 'not json', signed())).status).toBe(400)
    expect((await receivePayPalEvent(accountId, 'x'.repeat(70_000), signed())).status).toBe(413)
  })
})

describe('a flood of forged deliveries to one account’s address', () => {
  const FORGER = '198.51.100.7'

  it('costs PayPal one check each up to the hour’s allowance for the network it comes from, and after that is refused unchecked', async () => {
    const { simulatedPayPal } = await getServices()
    if (simulatedPayPal === undefined) throw new Error('No simulated PayPal.')
    const checks = vi.spyOn(simulatedPayPal, 'verifyWebhook')
    caller = FORGER
    try {
      for (let each = 0; each < FORGED_DELIVERIES.max; each += 1) {
        expect((await receivePayPalEvent(accountId, event('CUSTOMER.DISPUTE.CREATED', { id: 'PP-D-3' }), signed('forged'))).status).toBe(401)
      }
      expect(checks).toHaveBeenCalledTimes(FORGED_DELIVERIES.max)
      expect((await receivePayPalEvent(accountId, event('CUSTOMER.DISPUTE.CREATED', { id: 'PP-D-3' }), signed('forged'))).status).toBe(429)
      expect(checks).toHaveBeenCalledTimes(FORGED_DELIVERIES.max)
    } finally {
      caller = PAYPAL_NETWORK
      checks.mockRestore()
    }
  })

  it('is counted only for posts PayPal refused, so PayPal’s own deliveries never use it up', async () => {
    caller = '192.0.2.14'
    try {
      for (let each = 0; each <= FORGED_DELIVERIES.max; each += 1) {
        expect((await receivePayPalEvent(accountId, event('CUSTOMER.DISPUTE.CREATED', { id: 'PP-D-4' }), signed())).status).toBe(200)
      }
    } finally {
      caller = PAYPAL_NETWORK
    }
  })

  it('never stops PayPal’s own event, which comes from another network', async () => {
    const { rentalId, orderId } = await approvedButGone(12)
    expect((await receivePayPalEvent(accountId, event('CHECKOUT.ORDER.APPROVED', { id: orderId }, 'WH-AFTER-FLOOD'), signed())).status).toBe(200)
    expect(await storedWithId('WH-AFTER-FLOOD')).toBe(1)
    expect(await stateOf(rentalId)).toBe('booked')
  })
})
