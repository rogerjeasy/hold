// @vitest-environment node
import { createHash, randomBytes } from 'node:crypto'
import { auditLog, inShop, issueRenterLink, itemCatalog, listStaff, priceEntries, rentalDetail, renterLinks } from '@hold/db'
import { RENTER_ACTION_NAMES, renterViews } from '@hold/mobile-api'
import sharp from 'sharp'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// The phone app's renter routes (architecture.md section 13.8): the renter's link token as a bearer, through the very
// server functions and page loaders the renter's web page uses, with the test environment's PayPal.

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 9).toString('base64')

const jar = new Map<string, string>()
const forwarded = { value: '203.0.113.70' }
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
      set: (name: string, value: string) => jar.set(name, value),
      delete: (cookie: string | { name: string }) => jar.delete(typeof cookie === 'string' ? cookie : cookie.name),
    }),
  headers: () => Promise.resolve(new Headers({ 'x-forwarded-for': forwarded.value })),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({ getTranslations: () => Promise.resolve((key: string) => key) }))

const rentals = await import('@/features/rentals/actions')
const handover = await import('@/features/handover/actions')
const paypalReturn = await import('@/app/api/mobile/v1/paypal-return/[kind]/route')
const { getServices, TEST_SIGN_IN_CODE } = await import('./services')
const { newRenterLink } = await import('./renter-links')
const { form, signIn } = await import('@/test/shop-session')
const { handoverShop } = await import('@/test/ready-rental')
const { presentedClaim } = await import('@/test/presented-claim')
const { rawAction, rawView, renterPhone } = await import('@/test/mobile-renter')

vi.setConfig({ testTimeout: 60_000 })

const OWNER = 'owner@phone-renter.example'
const QUALITY = { sharpness: '120', shadows: '20', highlights: '220', filled: '0.6' }
let shop: Awaited<ReturnType<typeof handoverShop>>
let typeId: string
let priceId: string

const day = (offset: number) => `${new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)}T10:00`
const orderOf = (approvalUrl: string) => approvalUrl.split('/').at(-1) ?? ''
const inTheShop = async <Result>(work: Parameters<typeof inShop<Result>>[2], shopId = shop.shopId) => inShop((await getServices()).database, { role: 'hold_app', shopId }, work)

// A booking waiting for its fee, far from the handover shop's own rentals so the items are free.
let from = 200
async function bookedRental() {
  from += 3
  await signIn(jar, OWNER, 'email_code')
  const booked = await rentals.bookRental(null, form({ startsAt: day(from), endsAt: day(from + 2), itemTypeId: typeId, count: '1', contactName: 'Priya', contactEmail: 'priya@renter.example', language: 'en', locale: 'en' }))
  if (!booked.ok) throw new Error(JSON.stringify(booked))
  const shown = await rentals.showRenterLink(null, form({ rentalId: booked.value.rentalId, locale: 'en' }))
  if (!shown.ok) throw new Error(JSON.stringify(shown))
  jar.clear()
  return { rentalId: booked.value.rentalId, token: shown.value.url.split('/r/')[1]?.split(/[/?]/)[0] ?? '' }
}

// A rental handed over with both views photographed, as staff do at the counter.
const picture = () => sharp(randomBytes(64 * 48 * 3), { raw: { width: 64, height: 48, channels: 3 } }).resize(640, 480).jpeg().toBuffer()
async function handedOver() {
  await signIn(jar, OWNER, 'email_code')
  const rental = await shop.readyRental()
  const itemId = (await inTheShop((transaction) => rentalDetail(transaction, rental.rentalId, new Date())))?.items[0]?.id ?? ''
  const begun = await handover.startHandover(null, form({ rentalId: rental.rentalId, itemId, locale: 'en' }))
  if (!begun.ok) throw new Error(JSON.stringify(begun))
  for (const view of ['left-side', 'right-side']) {
    const body = await picture()
    const link = await handover.requestPhotoUpload(null, form({ sessionId: begun.value.sessionId, view, sha256: createHash('sha256').update(body).digest('hex'), bytes: String(body.length), locale: 'en' }))
    if (!link.ok) throw new Error(JSON.stringify(link))
    ;(await getServices()).simulatedEvidence?.receive(link.value.key, body, link.value.headers['x-amz-checksum-sha256'] ?? '')
    await handover.confirmPhotoUpload(null, form({ sessionId: begun.value.sessionId, view, key: link.value.key, ...QUALITY, locale: 'en' }))
  }
  await handover.sealHandover(null, form({ sessionId: begun.value.sessionId, locale: 'en' }))
  jar.clear()
  return { ...rental, itemId }
}

async function linkFor(rentalId: string, scopes: readonly string[], change?: { readonly expiresAt?: Date; readonly revoked?: boolean }) {
  const link = await newRenterLink(new Date(Date.now() + 86_400_000))
  const expiresAt = change?.expiresAt ?? link.expiresAt
  if (change?.revoked === true) await inTheShop((transaction) => transaction.insert(renterLinks).values({ shopId: shop.shopId, rentalId, tokenFingerprint: link.fingerprint, scopes, expiresAt, revokedAt: new Date() }))
  else await inTheShop((transaction) => issueRenterLink(transaction, shop.shopId, rentalId, { fingerprint: link.fingerprint, expiresAt }, scopes))
  return link.token
}

const json = async (response: Response) => ({ status: response.status, body: (await response.json()) as unknown })
const bearer = (token: string) => `Bearer ${token}`

beforeAll(async () => {
  shop = await handoverShop(jar, OWNER, 'Phone Renter Bikes')
  const { database } = await getServices()
  const ownerId = (await inShop(database, { role: 'hold_app', shopId: shop.shopId }, listStaff))[0]?.userId ?? ''
  typeId = (await inShop(database, { role: 'hold_app', shopId: shop.shopId, userId: ownerId }, itemCatalog)).types[0]?.id ?? ''
  priceId = (await inTheShop((transaction) => transaction.select().from(priceEntries)))[0]?.id ?? ''
})

beforeEach(() => {
  jar.clear()
  forwarded.value = '203.0.113.70'
})

describe('paying from the phone', () => {
  it('pays the fee and approves the hold on PayPal’s own page, comes back to the app, and confirms against PayPal', async () => {
    const { simulatedPayPal, config } = await getServices()
    const rental = await bookedRental()
    const phone = renterPhone(rental.token)

    const before = await phone.view('rental')
    expect(before).toMatchObject({ ok: true, value: { view: { state: 'pending_payment', shopName: 'Phone Renter Bikes', currency: 'EUR' } } })

    const fee = await phone.act('pay-fee', { returnTo: 'app' })
    if (!fee.ok) throw new Error(JSON.stringify(fee))
    const orderId = orderOf(fee.value.approvalUrl)
    // PayPal sends the renter to Hold's page that hands them back to the app, not to the web page.
    const back = `${config.publicUrl}/api/mobile/v1/paypal-return/fee`
    expect(simulatedPayPal?.orderLinks(orderId)).toMatchObject({ returnUrl: back, cancelUrl: back })
    expect(fee.value.returnUrl).toBe(`${back}?token=${orderId}`)

    // Coming back proves nothing: until PayPal shows the order approved, nothing is recorded.
    expect(await phone.act('confirm-fee', { orderId })).toEqual({ ok: false, failure: 'refused', reason: 'not_approved' })
    simulatedPayPal?.approveOrder(orderId)
    const handedBack = await paypalReturn.GET(new Request(`${back}?token=${orderId}&PayerID=FAKEPAYER0001`), { params: Promise.resolve({ kind: 'fee' }) })
    expect(handedBack.status).toBe(303)
    expect(handedBack.headers.get('location')).toBe(`hold://paypal-return?kind=fee&order=${orderId}`)
    const confirmed = await phone.act('confirm-fee', { orderId })
    expect(confirmed.ok && ['booked', 'capturing'].includes(confirmed.value.state)).toBe(true)
    // Only the order this rental started.
    expect(await phone.act('confirm-fee', { orderId: 'FAKE-ORDER-ELSEWHERE' })).toEqual({ ok: false, failure: 'refused', reason: 'order_mismatch' })

    await signIn(jar, OWNER, 'email_code')
    expect(await rentals.askForHold(null, form({ rentalId: rental.rentalId, locale: 'en' }))).toMatchObject({ ok: true })
    jar.clear()
    const hold = await phone.act('approve-hold', { returnTo: 'app' })
    if (!hold.ok) throw new Error(JSON.stringify(hold))
    const holdOrder = orderOf(hold.value.approvalUrl)
    expect(simulatedPayPal?.orderLinks(holdOrder)?.returnUrl).toBe(`${config.publicUrl}/api/mobile/v1/paypal-return/hold`)
    simulatedPayPal?.approveOrder(holdOrder)
    const placed = await phone.act('confirm-hold', { orderId: holdOrder })
    expect(placed.ok && ['placed', 'placing'].includes(placed.value.state)).toBe(true)

    const after = await phone.view('hold')
    expect(after).toMatchObject({ ok: true, value: { hold: { currency: 'EUR', strategy: 'at_counter' } } })
    const text = JSON.stringify(after)
    for (const serverOnly of ['paypalAuthorizationId', 'feeOrderId', 'checkout', 'clientId', 'rentalId']) expect(text).not.toContain(serverOnly)

    // The same audit lines as on the web, written by the renter's link.
    const lines = await inTheShop((transaction) => transaction.select().from(auditLog))
    expect(lines.filter((line) => line.subjectId === rental.rentalId && line.actorKind === 'renter').map((line) => line.action)).toEqual(expect.arrayContaining(['renter.fee_started', 'renter.fee_confirmed', 'renter.hold_started', 'renter.hold_confirmed']))
  })

  it('still returns to the web page for a payment started on the web', async () => {
    const { simulatedPayPal } = await getServices()
    const rental = await bookedRental()
    const fee = await renterPhone(rental.token).act('pay-fee', {})
    if (!fee.ok) throw new Error(JSON.stringify(fee))
    expect(simulatedPayPal?.orderLinks(orderOf(fee.value.approvalUrl))?.returnUrl).toMatch(/\/r\/[^/]+\/paid$/)
  })

  it('hands back nothing but the app’s own address, for a kind it knows', async () => {
    const at = (kind: string, query: string) => paypalReturn.GET(new Request(`https://hold.test/api/mobile/v1/paypal-return/${kind}${query}`), { params: Promise.resolve({ kind }) })
    expect((await at('refund', '?token=X')).status).toBe(404)
    expect((await at('hold', '?token=<script>')).headers.get('location')).toBe('hold://paypal-return?kind=hold')
    expect((await at('extension', '')).headers.get('location')).toBe('hold://paypal-return?kind=extension')
  })
})

describe('a renter action from the phone', () => {
  it('is not found by a name the contract does not list', async () => {
    const rental = await bookedRental()
    expect(await json(await rawAction('capture-hold', { authorization: bearer(rental.token) }))).toEqual({ status: 404, body: { ok: false, failure: 'not_found' } })
  })

  it('refuses a missing, malformed, forged, expired and revoked token alike', async () => {
    const rental = await bookedRental()
    const expired = await linkFor(rental.rentalId, ['view', 'pay'], { expiresAt: new Date('2020-01-01') })
    const revoked = await linkFor(rental.rentalId, ['view', 'pay'], { revoked: true })
    for (const authorization of [undefined, `Basic ${rental.token}`, bearer(`${rental.token}x`), bearer(expired), bearer(revoked)]) {
      expect(await json(await rawAction('pay-fee', { authorization }))).toEqual({ status: 401, body: { ok: false, failure: 'link_invalid' } })
    }
  })

  it('refuses a link without the action’s scope', async () => {
    const rental = await bookedRental()
    const lookOnly = await linkFor(rental.rentalId, ['view'])
    expect(await json(await rawAction('pay-fee', { authorization: bearer(lookOnly) }))).toEqual({ status: 403, body: { ok: false, failure: 'scope' } })
  })

  it('refuses fields the action does not take, and a body that is not one flat object', async () => {
    const rental = await bookedRental()
    const authorization = bearer(rental.token)
    expect(await json(await rawAction('pay-fee', { authorization, body: JSON.stringify({ amountCents: 1 }) }))).toMatchObject({ status: 400, body: { ok: false, failure: 'invalid' } })
    expect(await json(await rawAction('confirm-fee', { authorization, body: JSON.stringify({ orderId: { $ne: '' } }) }))).toEqual({ status: 400, body: { ok: false, failure: 'invalid', fields: ['orderId'] } })
    expect(await json(await rawAction('pay-fee', { authorization, body: '[1]' }))).toMatchObject({ status: 400, body: { failure: 'invalid' } })
    expect(await json(await rawAction('pay-fee', { authorization, body: '{not json' }))).toMatchObject({ status: 400, body: { failure: 'invalid' } })
    expect(await json(await rawAction('write-to-shop', { authorization, body: JSON.stringify({ body: 'x'.repeat(40_000) }) }))).toMatchObject({ status: 400, body: { failure: 'invalid' } })
  })

  it('takes the token from the bearer only: one in the body changes nothing', async () => {
    const rental = await bookedRental()
    expect(await json(await rawAction('pay-fee', { authorization: bearer(`${rental.token}x`), body: JSON.stringify({ token: rental.token }) }))).toEqual({ status: 401, body: { ok: false, failure: 'link_invalid' } })
  })

  it('stops a network that keeps guessing tokens', async () => {
    forwarded.value = '198.51.100.250'
    const statuses: number[] = []
    for (let guess = 0; guess < 61; guess += 1) statuses.push((await rawAction('pay-fee', { authorization: bearer(`guess-${String(guess)}`) })).status)
    expect(statuses.slice(0, 60).every((status) => status === 401)).toBe(true)
    expect(await json(await rawAction('pay-fee', { authorization: bearer('one-more') }))).toEqual({ status: 429, body: { ok: false, failure: 'rate_limited' } })
  })
})

describe('a renter screen from the phone', () => {
  it('reads every screen of a handed-over rental, with only the fields the contract names', async () => {
    const rental = await handedOver()
    const phone = renterPhone(rental.token)
    for (const name of ['rental', 'hold', 'condition', 'extension', 'incidents', 'return', 'record', 'trust'] as const) {
      const read = await phone.view(name)
      expect(read, name).toMatchObject({ ok: true })
    }
    // No assistant booked it, so that screen answers as the web page does: nothing to show, through a working link.
    expect(await phone.view('assistant')).toEqual({ ok: false, failure: 'not_found' })
    // No claim yet, nor a negotiation.
    expect(await phone.view('claim')).toEqual({ ok: false, failure: 'not_found' })
    expect(await phone.view('negotiation')).toEqual({ ok: false, failure: 'not_found' })
    const condition = await phone.view('condition')
    expect(condition).toMatchObject({ ok: true, value: { canReply: false, items: [{ itemId: rental.itemId, photos: [{ view: 'left-side' }, { view: 'right-side' }] }] } })
  })

  it('reports an incident and reads it back, and another rental’s token finds nothing of it', async () => {
    const rental = await handedOver()
    const other = await handedOver()
    const reported = await renterPhone(rental.token).act('report-incident', { itemId: rental.itemId, hint: 'damage', description: 'The bell came off.' })
    if (!reported.ok) throw new Error(JSON.stringify(reported))
    expect(await renterPhone(rental.token).incident(reported.value.incidentId)).toMatchObject({ ok: true, value: { incident: { id: reported.value.incidentId, description: 'The bell came off.', hint: 'damage' } } })
    expect(await renterPhone(other.token).incident(reported.value.incidentId)).toEqual({ ok: false, failure: 'link_invalid' })
    expect(await renterPhone(rental.token).incident('not-an-id')).toEqual({ ok: false, failure: 'not_found' })
    expect(JSON.stringify(await renterPhone(rental.token).incident(reported.value.incidentId))).not.toContain('sessionId')
  })

  it('reads the claim, and hands the contest to an advocate with the one-time code', async () => {
    const claim = await presentedClaim(jar, shop, priceId)
    jar.clear()
    const phone = renterPhone(claim.claimToken)
    expect(await phone.view('claim')).toMatchObject({ ok: true, value: { state: 'presented', canReply: true, canAdvocate: true, currency: 'EUR', lines: [{ amountCents: 3500 }], contest: null } })
    expect(await phone.act('send-claim-code', { via: 'chosen' })).toMatchObject({ ok: true })
    expect(await phone.act('start-advocate', { code: TEST_SIGN_IN_CODE, highest: '20' })).toMatchObject({ ok: true })
    expect(await phone.view('negotiation')).toMatchObject({ ok: true, value: { canAct: true, highestTotalCents: 2000, advocate: 'hold', transcript: { currency: 'EUR', claimTotalCents: 3500 } } })
  })

  it('refuses a screen by a name it does not know, a missing token, and a link without the screen’s scope', async () => {
    const rental = await bookedRental()
    expect(await json(await rawView('ledger', bearer(rental.token)))).toEqual({ status: 404, body: { ok: false, failure: 'not_found' } })
    expect(await json(await rawView('rental'))).toEqual({ status: 401, body: { ok: false, failure: 'link_invalid' } })
    const lookOnly = await linkFor(rental.rentalId, ['view'])
    expect(await json(await rawView('incidents', bearer(lookOnly)))).toEqual({ status: 403, body: { ok: false, failure: 'scope' } })
  })
})

describe('the phone’s renter routes', () => {
  it('are each built by the one renter wrapper', async () => {
    const { isMobileRenterRoute } = await import('./mobile-renter-route')
    const files = import.meta.glob<Record<string, unknown>>('/src/app/api/mobile/v1/renter/**/route.ts')
    expect(Object.keys(files).length).toBeGreaterThanOrEqual(3)
    for (const [file, load] of Object.entries(files)) {
      const handlers = Object.entries(await load()).filter(([name]) => /^(GET|POST|PUT|PATCH|DELETE)$/.test(name))
      expect(handlers.length, file).toBeGreaterThan(0)
      expect(handlers.filter(([, handler]) => !isMobileRenterRoute(handler)).map(([name]) => `${file} ${name}`)).toEqual([])
    }
  })

  it('reach every renter action, or say why one is left out', async () => {
    const { MOBILE_RENTER_ACTIONS, NOT_ON_THE_PHONE } = await import('./mobile-renter-actions')
    const { isRenterAction } = await import('./renter-access')
    expect(Object.keys(MOBILE_RENTER_ACTIONS).sort()).toEqual([...RENTER_ACTION_NAMES].sort())
    for (const action of Object.values(MOBILE_RENTER_ACTIONS)) expect(isRenterAction(action)).toBe(true)
    const reached = new Set<unknown>(Object.values(MOBILE_RENTER_ACTIONS))
    const files = import.meta.glob<Record<string, unknown>>(['/src/features/renter/actions.ts', '/src/features/*/renter-actions.ts'])
    const missing: string[] = []
    for (const [file, load] of Object.entries(files)) {
      for (const [name, value] of Object.entries(await load())) if (!reached.has(value) && NOT_ON_THE_PHONE[`${file} ${name}`] === undefined) missing.push(`${file} ${name}`)
    }
    expect(missing).toEqual([])
    for (const reason of Object.values(NOT_ON_THE_PHONE)) expect(reason.length).toBeGreaterThan(10)
  })

  it('read a screen for every view the contract names', () => {
    expect(Object.keys(renterViews).sort()).toEqual(['assistant', 'claim', 'condition', 'extension', 'hold', 'incidents', 'negotiation', 'record', 'rental', 'return', 'trust'])
  })
})
