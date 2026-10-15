// @vitest-environment node
import { acceptInvitation, auditLog, createInvitation, inShop, itemCatalog, moneyEvents, registerOwner, rentalDetail } from '@hold/db'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 9).toString('base64')

const jar = new Map<string, string>()
const forwarded = { value: '203.0.113.7' }
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
vi.mock('next-intl/server', () => ({ getTranslations: () => Promise.resolve((key: string, values?: Record<string, unknown>) => `${key} ${JSON.stringify(values ?? {})}`) }))

const rentals = await import('./actions')
const renter = await import('@/features/renter/actions')
const shopPage = await import('@/features/shop-page/actions')
const shop = await import('@/features/shop/actions')
const items = await import('@/features/items/actions')
const { getServices } = await import('@/server/services')
const { form, signIn } = await import('@/test/shop-session')

vi.setConfig({ testTimeout: 30_000 })

const OWNER = 'owner@ribeira.example'
let shopId: string
let ownerId: string
let ebikeTypeId: string

// Tomorrow at ten on the shop's clock, for three days.
const day = (offset: number) => {
  const date = new Date(Date.now() + offset * 24 * 60 * 60 * 1000)
  return `${date.toISOString().slice(0, 10)}T10:00`
}

const booking = (count = '1', contactEmail = 'priya@example.com', from = 1) => ({
  startsAt: day(from),
  endsAt: day(from + 3),
  itemTypeId: ebikeTypeId,
  count,
  contactName: 'Priya Natarajan',
  contactEmail,
  language: 'en',
  locale: 'en',
})

const tokenOf = (url: string) => url.split('/r/')[1]?.split(/[/?]/)[0] ?? ''

// Each on days of its own, so the shop's three e-bikes never run out.
let nextFrom = 30
async function newBooking(count = '1'): Promise<{ rentalId: string; token: string }> {
  await signIn(jar, OWNER, 'email_code')
  nextFrom += 4
  const booked = await rentals.bookRental(null, form(booking(count, 'priya@example.com', nextFrom)))
  if (!booked.ok) throw new Error(JSON.stringify(booked))
  const shown = await rentals.showRenterLink(null, form({ rentalId: booked.value.rentalId, locale: 'en' }))
  if (!shown.ok) throw new Error(JSON.stringify(shown))
  jar.clear()
  return { rentalId: booked.value.rentalId, token: tokenOf(shown.value.url) }
}

const detail = async (rentalId: string) => {
  const { database } = await getServices()
  return inShop(database, { role: 'hold_app', shopId }, (transaction) => rentalDetail(transaction, rentalId, new Date()))
}

beforeAll(async () => {
  const { database } = await getServices()
  const subject = await signIn(jar, OWNER, 'passkey')
  const registered = await registerOwner(database, { subject, email: OWNER, name: 'Ana', language: 'en', shop: { name: 'Porto Rentals', timeZone: 'UTC' } })
  shopId = registered.shopId
  ownerId = registered.userId
  const prices = { currency: 'EUR', threshold: '', wearPolicy: 'Scuffs are wear.', description: 'Scratch', category: 'damage', amount: '35', locale: 'en' }
  expect(await shop.publishPrices(null, form(prices))).toMatchObject({ ok: true })
  const type = { itemTypeId: '', name: 'City e-bike', category: 'e_bike', value: '2400', hold: '300', dayRate: '40', viewLabel: 'Frame', viewOutline: 'whole_side', viewRequired: 'yes', locale: 'en' }
  expect(await items.saveItemType(null, form(type))).toMatchObject({ ok: true })
  ebikeTypeId = (await inShop(database, { role: 'hold_app', shopId, userId: ownerId }, itemCatalog)).types[0]?.id ?? ''
  expect(await items.addItems(null, form({ itemTypeId: ebikeTypeId, count: '3', size: '', serial: '', locale: 'en' }))).toMatchObject({ ok: true })
})

beforeEach(() => {
  jar.clear()
  forwarded.value = `203.0.113.${String(Math.floor(Math.random() * 250))}`
})

describe('booking at the counter', () => {
  it('waits for PayPal to be connected, where the fee is paid', async () => {
    await signIn(jar, OWNER, 'email_code')
    expect(await rentals.bookRental(null, form(booking()))).toEqual({ ok: false, failure: 'refused', reason: 'paypal_not_connected' })
    await signIn(jar, OWNER, 'passkey')
    expect(await shop.connectPayPal(null, form({ clientId: 'sandbox-client-id', clientSecret: 'sandbox-client-secret', locale: 'en' }))).toMatchObject({ ok: true })
  })

  it('books at the prices the shop set, and emails the renter a link to pay', async () => {
    await signIn(jar, OWNER, 'email_code')
    const booked = await rentals.bookRental(null, form(booking('2')))
    expect(booked).toMatchObject({ ok: true, value: { emailed: true } })
    if (!booked.ok) return
    expect(await detail(booked.value.rentalId)).toMatchObject({ state: 'pending_payment', feeCents: 2 * 3 * 40_00, holdCents: 2 * 300_00, contactEmail: 'priya@example.com' })
    const { mailer } = await getServices()
    const sent = (mailer as unknown as { sent: { to: string; text: string }[] }).sent.at(-1)
    expect(sent?.to).toBe('priya@example.com')
    expect(sent?.text).toMatch(/\/r\/[A-Za-z0-9_-]{65}/)
  })

  it('is open to counter staff and closed to read-only members', async () => {
    const { database } = await getServices()
    for (const [email, role] of [
      ['jonas@ribeira.example', 'counter_staff'],
      ['reader@ribeira.example', 'read_only'],
    ] as const) {
      const { token } = await inShop(database, { role: 'hold_app', shopId, userId: ownerId }, (transaction) =>
        createInvitation(transaction, { shopId, invitedByUserId: ownerId, email, role, approvalLimitCents: 0, language: 'en' }, new Date()),
      )
      const subject = await signIn(jar, email, 'email_code')
      await acceptInvitation(database, { token, subject, email, name: role, language: 'en' }, new Date())
    }
    await signIn(jar, 'jonas@ribeira.example', 'email_code')
    expect(await rentals.bookRental(null, form(booking('1', '')))).toMatchObject({ ok: true, value: { emailed: false } })
    await signIn(jar, 'reader@ribeira.example', 'email_code')
    expect(await rentals.bookRental(null, form(booking()))).toEqual({ ok: false, failure: 'role' })
  })

  it('takes no amount from the form', async () => {
    await signIn(jar, OWNER, 'email_code')
    expect(await rentals.bookRental(null, form({ ...booking(), feeCents: '1' }))).toMatchObject({ ok: false, failure: 'invalid' })
  })

  it('lets an unpaid booking go, so its items are free again', async () => {
    const { rentalId } = await newBooking()
    await signIn(jar, OWNER, 'email_code')
    expect(await rentals.letGoOfBooking(null, form({ rentalId, locale: 'en' }))).toEqual({ ok: true, value: {} })
    expect((await detail(rentalId))?.state).toBe('abandoned')
  })
})

describe('the renter’s link', () => {
  it('sends the renter to PayPal for exactly the fee, and books the rental once PayPal has it', async () => {
    const { rentalId, token } = await newBooking()
    const started = await renter.payFee(null, form({ token, locale: 'en' }))
    if (!started.ok) throw new Error(JSON.stringify(started))
    expect(started.value.approvalUrl).toMatch(/\/simulated-paypal\/FAKE-ORDER-/)
    const orderId = started.value.approvalUrl.split('/').at(-1) ?? ''
    const { simulatedPayPal, database } = await getServices()
    expect(simulatedPayPal?.orderLinks(orderId)?.amount).toEqual({ cents: 3 * 40_00, currency: 'EUR' })
    // What the renter reads in PayPal names what they rent, not a bare count.
    expect(simulatedPayPal?.orderLinks(orderId)?.description).toContain('1 × City e-bike')

    // Before the renter approves, nothing is captured.
    expect(await renter.confirmFee(null, form({ token, orderId, locale: 'en' }))).toEqual({ ok: false, failure: 'refused', reason: 'not_approved' })
    simulatedPayPal?.approveOrder(orderId)
    expect(await renter.confirmFee(null, form({ token, orderId, locale: 'en' }))).toEqual({ ok: true, value: { state: 'booked' } })
    expect(await renter.confirmFee(null, form({ token, orderId, locale: 'en' }))).toEqual({ ok: true, value: { state: 'booked' } })

    expect(await detail(rentalId)).toMatchObject({ state: 'booked', renterName: 'Fake Renter' })
    const money = await inShop(database, { role: 'hold_app', shopId }, (transaction) => transaction.select().from(moneyEvents)).then((rows) => rows.filter((row) => row.rentalId === rentalId))
    expect(money).toMatchObject([{ kind: 'fee_captured', amountCents: 3 * 40_00 }])
    const audit = await inShop(database, { role: 'hold_app', shopId }, (transaction) => transaction.select().from(auditLog)).then((rows) => rows.filter((row) => row.subjectId === rentalId))
    expect(audit.map((line) => line.action)).toEqual(expect.arrayContaining(['renter.fee_started', 'renter.fee_confirmed']))
  })

  it('reuses the order the renter is already approving', async () => {
    const { token } = await newBooking()
    const first = await renter.payFee(null, form({ token, locale: 'en' }))
    const second = await renter.payFee(null, form({ token, locale: 'en' }))
    expect(second).toEqual(first)
  })

  it('refuses a changed, unknown or revoked token the same way', async () => {
    const { token } = await newBooking()
    const changed = `${token.slice(0, -2)}${token.endsWith('AA') ? 'BB' : 'AA'}`
    expect(await renter.payFee(null, form({ token: changed, locale: 'en' }))).toEqual({ ok: false, failure: 'link_invalid' })
    expect(await renter.payFee(null, form({ token: 'nonsense', locale: 'en' }))).toEqual({ ok: false, failure: 'link_invalid' })
  })

  it('refuses a capture for an order the rental did not start', async () => {
    const { token } = await newBooking()
    expect(await renter.confirmFee(null, form({ token, orderId: 'FAKE-ORDER-0001', locale: 'en' }))).toEqual({ ok: false, failure: 'refused', reason: 'order_mismatch' })
  })

  it('is slowed down for a network that asks too often', async () => {
    forwarded.value = '198.51.100.9'
    let last: unknown
    for (let attempt = 0; attempt < 70; attempt += 1) last = await renter.payFee(null, form({ token: 'nonsense', locale: 'en' }))
    expect(last).toEqual({ ok: false, failure: 'rate_limited' })
  })
})

describe('booking on the shop’s own page', () => {
  it('books with nobody signed in, and hands back the renter’s link', async () => {
    const booked = await shopPage.bookOnShopPage(null, form({ shop: 'porto-rentals', startsAt: day(10), endsAt: day(11), itemTypeId: ebikeTypeId, count: '1', locale: 'de' }))
    if (!booked.ok) throw new Error(JSON.stringify(booked))
    expect(booked.value.url).toMatch(/^\/de\/r\/[A-Za-z0-9_-]{65}$/)
    const started = await renter.payFee(null, form({ token: tokenOf(booked.value.url), locale: 'de' }))
    expect(started).toMatchObject({ ok: true })
  })

  it('knows no shop by a made-up address', async () => {
    expect(await shopPage.bookOnShopPage(null, form({ shop: 'no-such-shop', startsAt: day(10), endsAt: day(11), itemTypeId: ebikeTypeId, count: '1', locale: 'en' }))).toEqual({
      ok: false,
      failure: 'refused',
      reason: 'not_found',
    })
  })

  it('limits how many bookings one network may make', async () => {
    forwarded.value = '198.51.100.20'
    let last: unknown
    for (let attempt = 0; attempt < 12; attempt += 1) last = await shopPage.bookOnShopPage(null, form({ shop: 'porto-rentals', startsAt: day(20), endsAt: day(21), itemTypeId: ebikeTypeId, count: '9', locale: 'en' }))
    expect(last).toEqual({ ok: false, failure: 'rate_limited' })
  })
})
