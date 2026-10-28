// @vitest-environment node
import { acceptInvitation, auditLog, createInvitation, holdUpkeep, inShop, itemCatalog, moneyEvents, registerOwner, rentalDetail, rentalHold, saveReplacementOrder } from '@hold/db'
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
const shop = await import('@/features/shop/actions')
const items = await import('@/features/items/actions')
const { getServices } = await import('@/server/services')
const { form, signIn } = await import('@/test/shop-session')

vi.setConfig({ testTimeout: 30_000 })

const OWNER = 'owner@hold-at-pickup.example'
const HOLD_CENTS = 300_00
let shopId: string
let ebikeTypeId: string

const day = (offset: number) => `${new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)}T10:00`
const tokenOf = (url: string) => url.split('/r/')[1]?.split(/[/?]/)[0] ?? ''
const orderOf = (approvalUrl: string) => approvalUrl.split('/').at(-1) ?? ''

// A rental whose fee is paid, each on days of its own so the shop's e-bikes never run out.
let nextFrom = 0
async function paidRental(): Promise<{ rentalId: string; token: string }> {
  await signIn(jar, OWNER, 'email_code')
  nextFrom += 3
  const booked = await rentals.bookRental(null, form({ startsAt: day(nextFrom), endsAt: day(nextFrom + 2), itemTypeId: ebikeTypeId, count: '1', contactName: 'Priya', contactEmail: '', language: 'en', locale: 'en' }))
  if (!booked.ok) throw new Error(JSON.stringify(booked))
  const shown = await rentals.showRenterLink(null, form({ rentalId: booked.value.rentalId, locale: 'en' }))
  if (!shown.ok) throw new Error(JSON.stringify(shown))
  jar.clear()
  const token = tokenOf(shown.value.url)
  const started = await renter.payFee(null, form({ token, locale: 'en' }))
  if (!started.ok) throw new Error(JSON.stringify(started))
  ;(await getServices()).simulatedPayPal?.approveOrder(orderOf(started.value.approvalUrl))
  await renter.confirmFee(null, form({ token, orderId: orderOf(started.value.approvalUrl), locale: 'en' }))
  return { rentalId: booked.value.rentalId, token }
}

// Staff ask for the hold at pickup; the QR code opens the renter's page for approving it.
async function askedAtPickup(): Promise<{ rentalId: string; token: string }> {
  const { rentalId } = await paidRental()
  await signIn(jar, OWNER, 'email_code')
  const asked = await rentals.askForHold(null, form({ rentalId, locale: 'en' }))
  if (!asked.ok) throw new Error(JSON.stringify(asked))
  jar.clear()
  return { rentalId, token: tokenOf(asked.value.url) }
}

const detail = async (rentalId: string) => inShop((await getServices()).database, { role: 'hold_app', shopId }, (transaction) => rentalDetail(transaction, rentalId, new Date()))

beforeAll(async () => {
  const { database } = await getServices()
  const subject = await signIn(jar, OWNER, 'passkey')
  const registered = await registerOwner(database, { subject, email: OWNER, name: 'Ana', language: 'en', shop: { name: 'Pickup Bikes', timeZone: 'UTC' } })
  shopId = registered.shopId
  const prices = { currency: 'EUR', threshold: '', wearPolicy: 'Scuffs are wear.', description: 'Scratch', category: 'damage', amount: '35', locale: 'en' }
  expect(await shop.publishPrices(null, form(prices))).toMatchObject({ ok: true })
  expect(await shop.connectPayPal(null, form({ clientId: 'sandbox-client-id', clientSecret: 'sandbox-client-secret', locale: 'en' }))).toMatchObject({ ok: true })
  const type = { itemTypeId: '', name: 'City e-bike', category: 'e_bike', value: '2400', hold: '300', dayRate: '40', viewLabel: 'Frame', viewOutline: 'whole_side', viewRequired: 'yes', locale: 'en' }
  expect(await items.saveItemType(null, form(type))).toMatchObject({ ok: true })
  ebikeTypeId = (await inShop(database, { role: 'hold_app', shopId, userId: registered.userId }, itemCatalog)).types[0]?.id ?? ''
  expect(await items.addItems(null, form({ itemTypeId: ebikeTypeId, count: '2', size: '', serial: '', locale: 'en' }))).toMatchObject({ ok: true })
  const { token } = await inShop(database, { role: 'hold_app', shopId, userId: registered.userId }, (transaction) =>
    createInvitation(transaction, { shopId, invitedByUserId: registered.userId, email: 'reader@hold-at-pickup.example', role: 'read_only', approvalLimitCents: 0, language: 'en' }, new Date()),
  )
  const reader = await signIn(jar, 'reader@hold-at-pickup.example', 'email_code')
  await acceptInvitation(database, { token, subject: reader, email: 'reader@hold-at-pickup.example', name: 'Reader', language: 'en' }, new Date())
})

beforeEach(() => {
  jar.clear()
  forwarded.value = `203.0.113.${String(Math.floor(Math.random() * 250))}`
})

describe('asking for the hold at pickup', () => {
  it('makes the rental wait for its hold, and shows a code that opens the renter’s page for approving it', async () => {
    const { rentalId } = await paidRental()
    await signIn(jar, OWNER, 'email_code')
    const asked = await rentals.askForHold(null, form({ rentalId, locale: 'en' }))
    if (!asked.ok) throw new Error(JSON.stringify(asked))
    expect(asked.value.url).toMatch(/\/r\/[A-Za-z0-9_-]{65}\/pay$/)
    expect(asked.value.qr).toContain('<svg')
    expect((await detail(rentalId))?.state).toBe('awaiting_hold')
  })

  it('is refused before the fee is paid', async () => {
    await signIn(jar, OWNER, 'email_code')
    nextFrom += 3
    const booked = await rentals.bookRental(null, form({ startsAt: day(nextFrom), endsAt: day(nextFrom + 1), itemTypeId: ebikeTypeId, count: '1', contactName: '', contactEmail: '', language: 'en', locale: 'en' }))
    if (!booked.ok) throw new Error(JSON.stringify(booked))
    expect(await rentals.askForHold(null, form({ rentalId: booked.value.rentalId, locale: 'en' }))).toEqual({ ok: false, failure: 'refused', reason: 'not_booked' })
  })

  it('is closed to read-only members', async () => {
    const { rentalId } = await paidRental()
    await signIn(jar, 'reader@hold-at-pickup.example', 'email_code')
    expect(await rentals.askForHold(null, form({ rentalId, locale: 'en' }))).toEqual({ ok: false, failure: 'role' })
  })
})

describe('the renter approving the hold', () => {
  it('sends the renter to PayPal for exactly the agreed hold, and places it once PayPal has authorized it', async () => {
    const { rentalId, token } = await askedAtPickup()
    const started = await renter.approveHold(null, form({ token, locale: 'en' }))
    if (!started.ok) throw new Error(JSON.stringify(started))
    const orderId = orderOf(started.value.approvalUrl)
    const { simulatedPayPal, database } = await getServices()
    expect(simulatedPayPal?.orderLinks(orderId)?.amount).toEqual({ cents: HOLD_CENTS, currency: 'EUR' })
    // PayPal's own button returns to where PayPal's page would, with the order named as PayPal names it.
    expect(started.value.orderId).toBe(orderId)
    expect(started.value.returnUrl).toBe(`${simulatedPayPal?.orderLinks(orderId)?.returnUrl ?? ''}?token=${orderId}`)
    expect(simulatedPayPal?.orderLinks(orderId)?.returnUrl).toMatch(/\/r\/[A-Za-z0-9_-]{65}\/pay$/)

    expect(await renter.confirmHold(null, form({ token, orderId, locale: 'en' }))).toEqual({ ok: false, failure: 'refused', reason: 'not_approved' })
    simulatedPayPal?.approveOrder(orderId)
    expect(await renter.confirmHold(null, form({ token, orderId, locale: 'en' }))).toEqual({ ok: true, value: { state: 'placed' } })
    expect(await renter.confirmHold(null, form({ token, orderId, locale: 'en' }))).toEqual({ ok: true, value: { state: 'placed' } })

    expect((await detail(rentalId))?.state).toBe('ready')
    const lines = await inShop(database, { role: 'hold_app', shopId }, (transaction) => transaction.select().from(moneyEvents)).then((rows) => rows.filter((row) => row.rentalId === rentalId))
    expect(lines.map((line) => [line.kind, line.amountCents])).toEqual([
      ['fee_captured', 2 * 40_00],
      ['hold_placed', HOLD_CENTS],
    ])
    const audit = await inShop(database, { role: 'hold_app', shopId }, (transaction) => transaction.select().from(auditLog))
    expect(audit.filter((row) => row.subjectId === rentalId).map((line) => line.action)).toEqual(expect.arrayContaining(['renter.hold_started', 'renter.hold_confirmed']))
    // Staff lines name the person who acted, not the rental.
    expect(audit.some((line) => line.action === 'rental.hold_asked' && line.actorKind === 'person')).toBe(true)
  })

  it('reuses the order the renter is already approving', async () => {
    const { token } = await askedAtPickup()
    expect(await renter.approveHold(null, form({ token, locale: 'en' }))).toEqual(await renter.approveHold(null, form({ token, locale: 'en' })))
  })

  it('waits until staff ask for the hold at pickup', async () => {
    const { token } = await paidRental()
    expect(await renter.approveHold(null, form({ token, locale: 'en' }))).toEqual({ ok: false, failure: 'refused', reason: 'not_requested' })
  })

  it('refuses to confirm an order the hold did not start', async () => {
    const { token } = await askedAtPickup()
    expect(await renter.confirmHold(null, form({ token, orderId: 'FAKE-ORDER-0001', locale: 'en' }))).toEqual({ ok: false, failure: 'refused', reason: 'order_mismatch' })
  })

  it('tells the renter plainly when their funding is declined, and lets them approve again', async () => {
    const { rentalId, token } = await askedAtPickup()
    const { simulatedPayPal } = await getServices()
    const first = await renter.approveHold(null, form({ token, locale: 'en' }))
    if (!first.ok) throw new Error(JSON.stringify(first))
    simulatedPayPal?.approveOrder(orderOf(first.value.approvalUrl))
    simulatedPayPal?.declineFunding(orderOf(first.value.approvalUrl))
    expect(await renter.confirmHold(null, form({ token, orderId: orderOf(first.value.approvalUrl), locale: 'en' }))).toEqual({ ok: false, failure: 'refused', reason: 'declined' })
    expect((await detail(rentalId))?.state).toBe('awaiting_hold')

    const second = await renter.approveHold(null, form({ token, locale: 'en' }))
    if (!second.ok) throw new Error(JSON.stringify(second))
    expect(orderOf(second.value.approvalUrl)).not.toBe(orderOf(first.value.approvalUrl))
    simulatedPayPal?.approveOrder(orderOf(second.value.approvalUrl))
    expect(await renter.confirmHold(null, form({ token, orderId: orderOf(second.value.approvalUrl), locale: 'en' }))).toEqual({ ok: true, value: { state: 'placed' } })
    expect((await detail(rentalId))?.state).toBe('ready')
  })
})

describe('replacing the hold before it ends', () => {
  it('lets the renter approve a new hold from the link they were sent, then releases the old one', async () => {
    const { rentalId, token } = await askedAtPickup()
    const { simulatedPayPal, database } = await getServices()
    const first = await renter.approveHold(null, form({ token, locale: 'en' }))
    if (!first.ok) throw new Error(JSON.stringify(first))
    simulatedPayPal?.approveOrder(orderOf(first.value.approvalUrl))
    await renter.confirmHold(null, form({ token, orderId: orderOf(first.value.approvalUrl), locale: 'en' }))
    const inThisShop = <Result>(work: Parameters<typeof inShop<Result>>[2]) => inShop(database, { role: 'hold_app', shopId }, work)
    const placed = await inThisShop((transaction) => rentalHold(transaction, rentalId))
    const upkeep = await inThisShop((transaction) => holdUpkeep(transaction, placed?.id ?? ''))
    if (placed === undefined || upkeep === undefined) throw new Error('No placed hold.')

    // What the worker does three days before the hold ends.
    const order = await simulatedPayPal?.createHoldOrder({ amount: { cents: HOLD_CENTS, currency: 'EUR' }, rentalReference: rentalId, description: 'Refundable hold', returnUrl: 'https://hold.test/pay', cancelUrl: 'https://hold.test/pay', idempotencyKey: `replacement-${rentalId}` })
    if (order?.ok !== true) throw new Error('No replacement order.')
    await inThisShop((transaction) => saveReplacementOrder(transaction, placed.id, upkeep.authorizationId, order.value.orderId))

    const started = await renter.approveHold(null, form({ token, locale: 'en' }))
    if (!started.ok) throw new Error(JSON.stringify(started))
    expect(orderOf(started.value.approvalUrl)).toBe(order.value.orderId)
    expect(await renter.confirmHold(null, form({ token, orderId: order.value.orderId, locale: 'en' }))).toEqual({ ok: false, failure: 'refused', reason: 'not_approved' })
    simulatedPayPal?.approveOrder(order.value.orderId)
    expect(await renter.confirmHold(null, form({ token, orderId: order.value.orderId, locale: 'en' }))).toEqual({ ok: true, value: { state: 'placed' } })

    const after = await inThisShop((transaction) => rentalHold(transaction, rentalId))
    expect(after).toMatchObject({ state: 'placed', orderId: null })
    expect(after?.paypalAuthorizationId).not.toBe(placed.paypalAuthorizationId)
    const lines = await inThisShop((transaction) => transaction.select().from(moneyEvents)).then((rows) => rows.filter((row) => row.rentalId === rentalId))
    expect(lines.map((line) => line.kind)).toEqual(['fee_captured', 'hold_placed', 'hold_placed', 'hold_released'])
  })
})

