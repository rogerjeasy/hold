// @vitest-environment node
import { createHash } from 'node:crypto'
import { acceptInvitation, auditLog, createInvitation, inShop, listStaff, registerOwner } from '@hold/db'
import { SHOP_HEADER } from '@hold/mobile-api'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// The phone's way into a shop: a Cognito access token as a bearer and the shop named in a header, through the same
// checks as the web app's cookie session (AGENTS.md section 7), and only for the counter's quick actions.

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 9).toString('base64')

const jar = new Map<string, string>()
const forwarded = { value: '203.0.113.9' }
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

const actionRoute = await import('@/app/api/mobile/v1/shop/actions/[action]/route')
const todayRoute = await import('@/app/api/mobile/v1/shop/today/route')
const rentalsRoute = await import('@/app/api/mobile/v1/shop/rentals/route')
const rentalRoute = await import('@/app/api/mobile/v1/shop/rentals/[rentalId]/route')
const sessionRoute = await import('@/app/api/mobile/v1/shop/sessions/[sessionId]/route')
const claims = await import('@/features/claims/actions')
const { withStaffBearer } = await import('./staff-bearer')
const { getServices } = await import('./services')
const { signIn } = await import('@/test/shop-session')
const { handoverShop } = await import('@/test/ready-rental')

vi.setConfig({ testTimeout: 30_000 })

const OWNER = 'owner@phone.example'
const JONAS = 'jonas@phone.example'
const READER = 'reader@phone.example'
let shop: Awaited<ReturnType<typeof handoverShop>>
let otherShopId: string

// A person's access token as the phone holds it, with no cookie left behind.
async function tokenOf(email: string): Promise<string> {
  await signIn(jar, email, 'email_code')
  const token = jar.get('hold_access') ?? ''
  jar.clear()
  return token
}

async function invite(email: string, role: 'counter_staff' | 'read_only') {
  const { database } = await getServices()
  const ownerId = (await inShop(database, { role: 'hold_app', shopId: shop.shopId }, listStaff))[0]?.userId ?? ''
  const { token } = await inShop(database, { role: 'hold_app', shopId: shop.shopId, userId: ownerId }, (transaction) =>
    createInvitation(transaction, { shopId: shop.shopId, invitedByUserId: ownerId, email, role, approvalLimitCents: 10_000, language: 'en' }, new Date()),
  )
  const subject = await signIn(jar, email, 'email_code')
  await acceptInvitation(database, { token, subject, email, name: email.split('@')[0] ?? '', language: 'en' }, new Date())
  jar.clear()
}

type Call = { readonly token?: string; readonly shopId?: string; readonly body?: unknown; readonly raw?: string }

function request(path: string, call: Call, method = 'POST'): Request {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (call.token !== undefined) headers.set('authorization', `Bearer ${call.token}`)
  if (call.shopId !== undefined) headers.set(SHOP_HEADER, call.shopId)
  const body = method === 'GET' ? undefined : (call.raw ?? JSON.stringify(call.body ?? {}))
  return new Request(`https://hold.test/api/mobile/v1/shop/${path}`, { method, headers, body })
}

async function act(action: string, call: Call) {
  const response = await actionRoute.POST(request(`actions/${action}`, call), { params: Promise.resolve({ action }) })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function read(response: Promise<Response>) {
  const answered = await response
  return { status: answered.status, body: (await answered.json()) as { ok: boolean; value?: Record<string, unknown>; failure?: string } }
}

const none = { params: Promise.resolve({}) }
const sha = (body: Buffer) => createHash('sha256').update(body).digest('hex')

beforeAll(async () => {
  shop = await handoverShop(jar, OWNER, 'Phone Bikes')
  await invite(JONAS, 'counter_staff')
  await invite(READER, 'read_only')
  const { database } = await getServices()
  const subject = await signIn(jar, 'other@phone.example', 'email_code')
  otherShopId = (await registerOwner(database, { subject, email: 'other@phone.example', name: 'Other', language: 'en', shop: { name: 'Other Bikes', timeZone: 'UTC' } })).shopId
  jar.clear()
})

beforeEach(() => {
  jar.clear()
  forwarded.value = `203.0.113.${String(Math.floor(Math.random() * 250))}`
})

afterEach(() => {
  vi.useRealTimers()
})

async function readyItem() {
  const rental = await shop.readyRental()
  jar.clear()
  const token = await tokenOf(JONAS)
  const shown = await read(rentalRoute.GET(request(`rentals/${rental.rentalId}`, { token, shopId: shop.shopId }, 'GET'), { params: Promise.resolve({ rentalId: rental.rentalId }) }))
  const items = (shown.body.value?.['items'] ?? []) as { id: string }[]
  return { ...rental, itemId: items[0]?.id ?? '', jonas: token }
}

describe('a bearer request', () => {
  it('is refused without a token, with a forged one, and with one that lapsed', async () => {
    const { rentalId, itemId } = await readyItem()
    const body = { rentalId, itemId, locale: 'en' }
    expect(await act('start-handover', { shopId: shop.shopId, body })).toEqual({ status: 401, body: { ok: false, failure: 'signed_out' } })
    expect(await act('start-handover', { token: 'fake-access-forged', shopId: shop.shopId, body })).toEqual({ status: 401, body: { ok: false, failure: 'signed_out' } })
    const token = await tokenOf(JONAS)
    vi.useFakeTimers({ now: Date.now() + 2 * 3600 * 1000, toFake: ['Date'] })
    expect(await act('start-handover', { token, shopId: shop.shopId, body })).toEqual({ status: 401, body: { ok: false, failure: 'signed_out' } })
  })

  it('is refused when a session cookie comes with it', async () => {
    const { rentalId, itemId, jonas } = await readyItem()
    await signIn(jar, JONAS, 'passkey')
    expect(await act('start-handover', { token: jonas, shopId: shop.shopId, body: { rentalId, itemId, locale: 'en' } })).toEqual({ status: 401, body: { ok: false, failure: 'signed_out' } })
  })

  it('is refused in a shop the person has no role in, or with no shop named', async () => {
    const { rentalId, itemId, jonas } = await readyItem()
    const body = { rentalId, itemId, locale: 'en' }
    expect(await act('start-handover', { token: jonas, shopId: otherShopId, body })).toEqual({ status: 403, body: { ok: false, failure: 'no_shop' } })
    expect(await act('start-handover', { token: jonas, body })).toEqual({ status: 403, body: { ok: false, failure: 'no_shop' } })
    expect(await act('start-handover', { token: jonas, shopId: 'not-a-shop', body })).toEqual({ status: 403, body: { ok: false, failure: 'no_shop' } })
  })

  it('is refused for a role that may not act, as on the web', async () => {
    const { rentalId, itemId } = await readyItem()
    expect(await act('start-handover', { token: await tokenOf(READER), shopId: shop.shopId, body: { rentalId, itemId, locale: 'en' } })).toEqual({ status: 403, body: { ok: false, failure: 'role' } })
  })

  it('never passes a step that asks for a passkey, even for staff the web lets pass with an emailed code', async () => {
    const { rentalId } = await readyItem()
    const input = new FormData()
    for (const [name, value] of Object.entries({ rentalId, reason: 'Looked clean to me.', locale: 'en' })) input.append(name, value)
    await signIn(jar, JONAS, 'email_code')
    expect(await claims.confirmClean(null, input)).not.toEqual({ ok: false, failure: 'passkey_needed' })
    const jonas = await tokenOf(JONAS)
    expect(await withStaffBearer({ accessToken: jonas, shopId: shop.shopId }, () => claims.confirmClean(null, input))).toEqual({ ok: false, failure: 'passkey_needed' })
  })

  it('reaches only the actions on the list', async () => {
    const { rentalId, jonas } = await readyItem()
    expect(await act('confirm-clean', { token: jonas, shopId: shop.shopId, body: { rentalId, reason: 'Clean.', locale: 'en' } })).toEqual({ status: 404, body: { ok: false, failure: 'not_found' } })
    expect(await act('constructor', { token: jonas, shopId: shop.shopId, body: {} })).toEqual({ status: 404, body: { ok: false, failure: 'not_found' } })
  })

  it('refuses fields the action does not know, values that are not text, and a body that is not JSON', async () => {
    const { rentalId, itemId, jonas } = await readyItem()
    const call = { token: jonas, shopId: shop.shopId }
    expect(await act('start-handover', { ...call, body: { rentalId, itemId, locale: 'en', shopId: otherShopId } })).toMatchObject({ status: 400, body: { ok: false, failure: 'invalid' } })
    expect(await act('start-handover', { ...call, body: { rentalId, itemId: { $ne: null }, locale: 'en' } })).toMatchObject({ status: 400, body: { ok: false, failure: 'invalid', fields: ['itemId'] } })
    expect(await act('start-handover', { ...call, raw: 'not json' })).toMatchObject({ status: 400, body: { ok: false, failure: 'invalid' } })
    expect(await act('start-handover', { ...call, raw: '[]' })).toMatchObject({ status: 400, body: { ok: false, failure: 'invalid' } })
  })
})

describe('the counter on the phone', () => {
  it('hands an item over: starts, photographs, seals, and the audit line says the phone did it', async () => {
    const { rentalId, itemId, jonas } = await readyItem()
    const call = { token: jonas, shopId: shop.shopId }
    const started = await act('start-handover', { ...call, body: { rentalId, itemId, locale: 'en' } })
    expect(started).toMatchObject({ status: 200, body: { ok: true } })
    const sessionId = (started.body['value'] as { sessionId: string }).sessionId

    const camera = await read(sessionRoute.GET(request(`sessions/${sessionId}`, call, 'GET'), { params: Promise.resolve({ sessionId }) }))
    expect(camera.body).toMatchObject({ ok: true, value: { kind: 'handover', rentalId, sealed: false, missing: ['left-side', 'right-side'], canAct: true } })

    for (const view of ['left-side', 'right-side']) {
      const photo = Buffer.from(`a photograph of the ${view}`)
      const link = await act('request-handover-photo', { ...call, body: { sessionId, view, sha256: sha(photo), bytes: photo.length, locale: 'en' } })
      expect(link).toMatchObject({ status: 200, body: { ok: true } })
      const { key, headers } = link.body['value'] as { key: string; headers: Record<string, string> }
      expect((await getServices()).simulatedEvidence?.receive(key, photo, headers['x-amz-checksum-sha256'] ?? '')).toBe('stored')
      expect(await act('record-handover-photo', { ...call, body: { sessionId, view, key, sharpness: 120, shadows: 20, highlights: 220, filled: 0.6, locale: 'en' } })).toMatchObject({ status: 200, body: { ok: true } })
    }
    const sealed = await act('seal-handover', { ...call, body: { sessionId, locale: 'en' } })
    expect(sealed).toMatchObject({ status: 200, body: { ok: true, value: { rentalOut: true, conditionLink: { sent: 'email' } } } })
    expect(JSON.stringify(sealed.body)).not.toContain('<svg')

    const { database } = await getServices()
    const lines = await inShop(database, { role: 'hold_app', shopId: shop.shopId }, (transaction) => transaction.select().from(auditLog))
    expect(lines.find((line) => line.action === 'handover.sealed' && (line.detail as { factor?: string }).factor === 'bearer')).toBeDefined()
  })

  it('shows the renter’s link as an address for the phone to draw, and gives a refusal as the web does', async () => {
    const { rentalId, jonas } = await readyItem()
    const call = { token: jonas, shopId: shop.shopId }
    const shown = await act('show-renter-link', { ...call, body: { rentalId, locale: 'en' } })
    expect(shown).toMatchObject({ status: 200, body: { ok: true, value: { url: expect.stringContaining('/r/') as string } } })
    expect(Object.keys(shown.body['value'] as object)).toEqual(['url'])
    expect(await act('confirm-drop-off', { ...call, body: { rentalId, locale: 'en' } })).toMatchObject({ status: 409, body: { ok: false, failure: 'refused' } })
  })

  it('reads another shop’s rental as not found', async () => {
    const { rentalId } = await readyItem()
    const outsider = await tokenOf('other@phone.example')
    const answered = await read(rentalRoute.GET(request(`rentals/${rentalId}`, { token: outsider, shopId: otherShopId }, 'GET'), { params: Promise.resolve({ rentalId }) }))
    expect(answered).toEqual({ status: 404, body: { ok: false, failure: 'not_found' } })
  })
})

describe('what the phone reads', () => {
  it('shows today’s counter and how many decisions wait on the web', async () => {
    const { jonas } = await readyItem()
    const today = await read(todayRoute.GET(request('today', { token: jonas, shopId: shop.shopId }, 'GET'), none))
    expect(today.body).toMatchObject({ ok: true, value: { shop: { id: shop.shopId, name: 'Phone Bikes' }, role: 'counter_staff', decisions: { decidedOn: 'web' } } })
    expect(today.body.value?.['counter']).toBeInstanceOf(Array)
  })

  it('searches rentals by renter or item', async () => {
    const { rentalId, jonas } = await readyItem()
    const all = await read(rentalsRoute.GET(request('rentals', { token: jonas, shopId: shop.shopId }, 'GET'), none))
    expect((all.body.value?.['rentals'] as { id: string }[]).map((rental) => rental.id)).toContain(rentalId)
    const found = await read(rentalsRoute.GET(new Request('https://hold.test/api/mobile/v1/shop/rentals?q=PRIYA', { headers: { authorization: `Bearer ${jonas}`, [SHOP_HEADER]: shop.shopId } }), none))
    expect((found.body.value?.['rentals'] as { who: string }[]).every((rental) => rental.who === 'Priya')).toBe(true)
    const nobody = await read(rentalsRoute.GET(new Request('https://hold.test/api/mobile/v1/shop/rentals?q=nobody-at-all', { headers: { authorization: `Bearer ${jonas}`, [SHOP_HEADER]: shop.shopId } }), none))
    expect(nobody.body).toEqual({ ok: true, value: { rentals: [] } })
  })

  it('shapes one rental to the caller’s role: a read-only member sees no address and may not act', async () => {
    const { rentalId, jonas } = await readyItem()
    const params = { params: Promise.resolve({ rentalId }) }
    const counter = await read(rentalRoute.GET(request(`rentals/${rentalId}`, { token: jonas, shopId: shop.shopId }, 'GET'), params))
    expect(counter.body.value).toMatchObject({ id: rentalId, contactEmail: 'priya@renter.example', canAct: true, hold: { state: 'placed', currency: 'EUR' } })
    const reader = await read(rentalRoute.GET(request(`rentals/${rentalId}`, { token: await tokenOf(READER), shopId: shop.shopId }, 'GET'), { params: Promise.resolve({ rentalId }) }))
    expect(reader.body.value).toMatchObject({ id: rentalId, canAct: false })
    expect(reader.body.value).not.toHaveProperty('contactEmail')
  })

  it('refuses a read without a token', async () => {
    expect(await read(todayRoute.GET(request('today', { shopId: shop.shopId }, 'GET'), none))).toEqual({ status: 401, body: { ok: false, failure: 'signed_out' } })
  })
})

describe('every phone route', () => {
  it('is built by a mobile wrapper, so none skips the checks', async () => {
    const { isMobileStaffRoute } = await import('./mobile-staff')
    const { isMobileSessionRoute } = await import('./mobile-session')
    const files = import.meta.glob<Record<string, unknown>>(['/src/app/api/mobile/v1/shop/**/route.ts', '/src/app/api/mobile/v1/session/**/route.ts'])
    expect(Object.keys(files).length).toBeGreaterThanOrEqual(11)
    for (const [file, load] of Object.entries(files)) {
      const isWrapped = file.includes('/session/') ? isMobileSessionRoute : isMobileStaffRoute
      const exported = Object.entries(await load())
      expect(exported.length, file).toBeGreaterThan(0)
      expect(exported.filter(([, value]) => !isWrapped(value)).map(([name]) => `${file} ${name}`)).toEqual([])
    }
  })

  it('lists only actions built by shopAction that ask for no passkey, one for each action of the contract', async () => {
    const { STAFF_ACTION_NAMES } = await import('@hold/mobile-api')
    const { STAFF_ACTION_ROUTES } = await import('./mobile-staff-actions')
    const { shopActionSpec } = await import('./shop-access')
    expect(Object.keys(STAFF_ACTION_ROUTES).sort()).toEqual([...STAFF_ACTION_NAMES].sort())
    for (const [name, action] of Object.entries(STAFF_ACTION_ROUTES)) {
      expect(shopActionSpec(action)?.needsPasskey, name).toBe(false)
    }
  })
})
