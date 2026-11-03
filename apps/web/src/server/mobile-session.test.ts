// @vitest-environment node
import { registerOwner } from '@hold/db'
import { SHOP_HEADER } from '@hold/mobile-api'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Signing in on the phone: the same emailed code and the same judges' demo as the web's sign-in page, with the tokens
// in the answer's body and never in a cookie.

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 9).toString('base64')

const jar = new Map<string, string>()
const forwarded = { value: '198.51.100.1' }
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

const start = await import('@/app/api/mobile/v1/session/start/route')
const verify = await import('@/app/api/mobile/v1/session/verify/route')
const refresh = await import('@/app/api/mobile/v1/session/refresh/route')
const signOut = await import('@/app/api/mobile/v1/session/sign-out/route')
const demo = await import('@/app/api/mobile/v1/session/demo/route')
const me = await import('@/app/api/mobile/v1/session/me/route')
const today = await import('@/app/api/mobile/v1/shop/today/route')
const { getServices, TEST_SIGN_IN_CODE } = await import('./services')
const { signIn } = await import('@/test/shop-session')
const { tampered } = await import('@/test/tampered')

vi.setConfig({ testTimeout: 30_000 })

const none = { params: Promise.resolve({}) }
const EMAIL = 'ana@phone-session.example'
let shopId: string

type Answered = { status: number; body: { ok: boolean; value?: Record<string, unknown>; failure?: string; reason?: string; fields?: string[] } }

async function post(route: { POST: (request: Request, context: typeof none) => Promise<Response> }, body: unknown, raw?: string): Promise<Answered> {
  const response = await route.POST(new Request('https://hold.test/api/mobile/v1/session/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ?? JSON.stringify(body) }), none)
  return { status: response.status, body: (await response.json()) as Answered['body'] }
}

async function getWith(route: { GET: (request: Request, context: typeof none) => Promise<Response> }, accessToken: string, shop?: string): Promise<Answered> {
  const headers = new Headers({ authorization: `Bearer ${accessToken}` })
  if (shop !== undefined) headers.set(SHOP_HEADER, shop)
  const response = await route.GET(new Request('https://hold.test/api/mobile/v1/x', { headers }), none)
  return { status: response.status, body: (await response.json()) as Answered['body'] }
}

async function signedIn() {
  const started = await post(start, { email: EMAIL, locale: 'en' })
  const attempt = String(started.body.value?.['attempt'])
  const verified = await post(verify, { attempt, code: TEST_SIGN_IN_CODE })
  return verified.body.value as { accessToken: string; refreshToken: string; expiresInSeconds: number }
}

const logged: string[] = []

beforeAll(async () => {
  const { database } = await getServices()
  const subject = await signIn(jar, EMAIL, 'email_code')
  shopId = (await registerOwner(database, { subject, email: EMAIL, name: 'Ana', language: 'en', shop: { name: 'Session Bikes', timeZone: 'UTC' } })).shopId
})

beforeEach(() => {
  jar.clear()
  forwarded.value = `198.51.100.${String(Math.floor(Math.random() * 250))}`
  for (const level of ['log', 'warn', 'error', 'info'] as const) vi.spyOn(console, level).mockImplementation((...parts: unknown[]) => void logged.push(parts.map(String).join(' ')))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('signing in with an emailed code', () => {
  it('gives the tokens in the body, sets no cookie, and the token opens the person’s shop', async () => {
    const started = await post(start, { email: EMAIL, locale: 'en' })
    expect(started).toMatchObject({ status: 200, body: { ok: true, value: { attempt: expect.any(String) as string, expiresAt: expect.any(String) as string } } })
    const verified = await post(verify, { attempt: started.body.value?.['attempt'], code: TEST_SIGN_IN_CODE })
    expect(verified).toMatchObject({ status: 200, body: { ok: true, value: { accessToken: expect.any(String) as string, refreshToken: expect.any(String) as string } } })
    expect(jar.size).toBe(0)
    const accessToken = String(verified.body.value?.['accessToken'])
    expect(await getWith(me, accessToken)).toEqual({ status: 200, body: { ok: true, value: { name: 'Ana', email: EMAIL, shops: [{ shopId, name: 'Session Bikes', role: 'owner' }] } } })
    expect(await getWith(today, accessToken, shopId)).toMatchObject({ status: 200, body: { ok: true } })
  })

  it('answers every address the same way', async () => {
    const unknown = await post(start, { email: 'nobody@phone-session.example', locale: 'en' })
    expect(unknown).toMatchObject({ status: 200, body: { ok: true } })
    expect(await post(verify, { attempt: unknown.body.value?.['attempt'], code: TEST_SIGN_IN_CODE })).toEqual({ status: 409, body: { ok: false, failure: 'refused', reason: 'wrong' } })
  })

  it('refuses a wrong code, a changed attempt, an address that is no address, and fields it does not know', async () => {
    const started = await post(start, { email: EMAIL, locale: 'en' })
    const attempt = String(started.body.value?.['attempt'])
    expect(await post(verify, { attempt, code: '11111111' })).toEqual({ status: 409, body: { ok: false, failure: 'refused', reason: 'wrong' } })
    expect(await post(verify, { attempt: tampered(attempt), code: TEST_SIGN_IN_CODE })).toEqual({ status: 409, body: { ok: false, failure: 'refused', reason: 'attempt_over' } })
    expect(await post(verify, { attempt, code: 'twelve' })).toMatchObject({ status: 400, body: { ok: false, failure: 'invalid', fields: ['code'] } })
    expect(await post(start, { email: 'not an address', locale: 'en' })).toMatchObject({ status: 400, body: { ok: false, failure: 'invalid', fields: ['email'] } })
    expect(await post(start, { email: EMAIL, locale: 'en', shopId })).toMatchObject({ status: 400, body: { ok: false, failure: 'invalid' } })
    expect(await post(start, undefined, 'not json')).toMatchObject({ status: 400, body: { ok: false, failure: 'invalid' } })
  })

  it('refreshes the access token, and signing out ends the refresh token', async () => {
    const tokens = await signedIn()
    const renewed = await post(refresh, { refreshToken: tokens.refreshToken })
    expect(renewed).toMatchObject({ status: 200, body: { ok: true, value: { accessToken: expect.any(String) as string } } })
    expect(await getWith(me, String(renewed.body.value?.['accessToken']))).toMatchObject({ status: 200 })
    expect(await post(signOut, { refreshToken: tokens.refreshToken })).toEqual({ status: 200, body: { ok: true, value: {} } })
    expect(await post(refresh, { refreshToken: tokens.refreshToken })).toEqual({ status: 401, body: { ok: false, failure: 'signed_out' } })
  })

  it('refuses who-am-I with no token, a forged one, or a browser session beside it', async () => {
    const tokens = await signedIn()
    const response = await me.GET(new Request('https://hold.test/api/mobile/v1/session/me'), none)
    expect(response.status).toBe(401)
    expect(await getWith(me, 'fake-access-forged')).toEqual({ status: 401, body: { ok: false, failure: 'signed_out' } })
    await signIn(jar, EMAIL, 'passkey')
    expect(await getWith(me, tokens.accessToken)).toEqual({ status: 401, body: { ok: false, failure: 'signed_out' } })
  })

  it('limits how often one network may ask', async () => {
    forwarded.value = '198.51.100.250'
    const answers: number[] = []
    for (let each = 0; each < 61; each += 1) answers.push((await post(refresh, { refreshToken: 'fake-refresh-none' })).status)
    expect(answers.slice(0, 60).every((status) => status === 401)).toBe(true)
    expect(answers.at(-1)).toBe(429)
  })

  it('logs no token', async () => {
    const tokens = await signedIn()
    await post(refresh, { refreshToken: tokens.refreshToken })
    await post(signOut, { refreshToken: tokens.refreshToken })
    await post(refresh, { refreshToken: tokens.refreshToken })
    for (const line of logged) {
      expect(line).not.toContain(tokens.accessToken)
      expect(line).not.toContain(tokens.refreshToken)
    }
  })
})

describe('the judges’ demo on the phone', () => {
  it('starts a fresh demo as Jonas, and the phone can come back as Tomás in the same shop', async () => {
    const started = await post(demo, { account: 'staff' })
    expect(started).toMatchObject({ status: 200, body: { ok: true, value: { accessToken: expect.any(String) as string, demo: expect.any(String) as string, shopId: expect.any(String) as string } } })
    expect(jar.size).toBe(0)
    const demoShop = String(started.body.value?.['shopId'])
    const sealed = String(started.body.value?.['demo'])
    expect(sealed).not.toContain('@')
    expect((await getWith(me, String(started.body.value?.['accessToken']))).body.value).toMatchObject({ shops: [{ shopId: demoShop, role: 'counter_staff' }] })

    const owner = await post(demo, { account: 'owner', demo: sealed })
    expect(owner.body.value).toMatchObject({ shopId: demoShop })
    expect((await getWith(me, String(owner.body.value?.['accessToken']))).body.value).toMatchObject({ shops: [{ shopId: demoShop, role: 'owner' }] })
  })

  it('refuses a demo the phone changed', async () => {
    const started = await post(demo, { account: 'staff' })
    const sealed = String(started.body.value?.['demo'])
    expect(await post(demo, { account: 'owner', demo: tampered(sealed) })).toMatchObject({ status: 400, body: { ok: false, failure: 'invalid', fields: ['demo'] } })
    expect(await post(demo, { account: 'admin' })).toMatchObject({ status: 400, body: { ok: false, failure: 'invalid' } })
  })
})
