// @vitest-environment node
import { acceptInvitation, createInvitation, inShop, listStaff, priceEntries, pushDevices, registerOwner, renterLinks } from '@hold/db'
import { SHOP_HEADER } from '@hold/mobile-api'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Push notifications to the phone app (architecture.md section 13.9): a renter's phone registers through its link, a
// member of staff's through their bearer in the shop they name, and what Hold pushes carries no secret.

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 9).toString('base64')

const jar = new Map<string, string>()
const forwarded = { value: '203.0.113.80' }
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

const staffActionRoute = await import('@/app/api/mobile/v1/shop/actions/[action]/route')
const signOutRoute = await import('@/app/api/mobile/v1/session/sign-out/route')
const { getServices } = await import('./services')
const { pushToRenter, pushToStaff } = await import('./push')
const { signIn } = await import('@/test/shop-session')
const { handoverShop } = await import('@/test/ready-rental')
const { presentedClaimOf } = await import('@/test/presented-claim')
const { rawAction } = await import('@/test/mobile-renter')

vi.setConfig({ testTimeout: 60_000 })

const OWNER = 'owner@phone-push.example'
const COUNTER = 'counter@phone-push.example'
const READER = 'reader@phone-push.example'
const RENTER_PHONE = 'ExponentPushToken[renter-phone-0001]'
let shop: Awaited<ReturnType<typeof handoverShop>>
let otherShopId: string
let priceId: string

const sent = async () => (await getServices()).simulatedPush?.sent ?? []
const json = async (response: Response) => ({ status: response.status, body: (await response.json()) as Record<string, unknown> })
const inTheShop = async <Result>(work: Parameters<typeof inShop<Result>>[2]) => inShop((await getServices()).database, { role: 'hold_app', shopId: shop.shopId }, work)

async function accessTokenOf(email: string): Promise<string> {
  await signIn(jar, email, 'email_code')
  const token = jar.get('hold_access') ?? ''
  jar.clear()
  return token
}

async function invite(email: string, role: 'counter_staff' | 'read_only') {
  const { database } = await getServices()
  const ownerId = (await inTheShop(listStaff))[0]?.userId ?? ''
  const { token } = await inShop(database, { role: 'hold_app', shopId: shop.shopId, userId: ownerId }, (transaction) =>
    createInvitation(transaction, { shopId: shop.shopId, invitedByUserId: ownerId, email, role, approvalLimitCents: 0, language: 'en' }, new Date()),
  )
  const subject = await signIn(jar, email, 'email_code')
  await acceptInvitation(database, { token, subject, email, name: email.split('@')[0] ?? '', language: 'en' }, new Date())
  jar.clear()
}

function staffAct(action: string, call: { readonly token: string; readonly shopId: string; readonly body: unknown }) {
  const headers = new Headers({ 'content-type': 'application/json', authorization: `Bearer ${call.token}`, [SHOP_HEADER]: call.shopId })
  return staffActionRoute.POST(new Request(`https://hold.test/api/mobile/v1/shop/actions/${action}`, { method: 'POST', headers, body: JSON.stringify(call.body) }), { params: Promise.resolve({ action }) })
}

const registerRenter = (token: string, body: unknown = { pushToken: RENTER_PHONE, platform: 'ios' }) => rawAction('register-push', { authorization: `Bearer ${token}`, body: JSON.stringify(body), headers: { 'accept-language': 'fr' } })

beforeAll(async () => {
  shop = await handoverShop(jar, OWNER, 'Push Bikes')
  await invite(COUNTER, 'counter_staff')
  await invite(READER, 'read_only')
  priceId = (await inTheShop((transaction) => transaction.select().from(priceEntries)))[0]?.id ?? ''
  const { database } = await getServices()
  const subject = await signIn(jar, 'other@phone-push.example', 'email_code')
  otherShopId = (await registerOwner(database, { subject, email: 'other@phone-push.example', name: 'Other', language: 'en', shop: { name: 'Other Bikes', timeZone: 'UTC' } })).shopId
  jar.clear()
})

beforeEach(() => {
  jar.clear()
  forwarded.value = `203.0.113.${String(Math.floor(Math.random() * 250))}`
})

describe('a renter’s phone', () => {
  it('registers through its link and is told, in its language, when the claim is ready, with nothing in the push that is a secret', async () => {
    const ready = await shop.readyRental()
    const registered = await json(await registerRenter(ready.token))
    expect(registered).toMatchObject({ status: 200, body: { ok: true, value: { reference: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/) as unknown } } })
    const reference = (registered.body['value'] as { reference: string }).reference
    const before = (await sent()).length
    const claim = await presentedClaimOf(jar, shop, ready, priceId)
    jar.clear()
    const pushed = (await sent()).slice(before).filter((message) => message.to === RENTER_PHONE)
    expect(pushed).toEqual([{ to: RENTER_PHONE, title: 'Push Bikes', body: 'Votre réclamation est prête à lire.', data: { kind: 'renter', reference, page: 'claim' } }])

    // The shop’s answer goes by text or email as the renter chose, and to the phone as well.
    await signIn(jar, OWNER, 'email_code')
    const { writeToRenter } = await import('@/features/promise/actions')
    const { form } = await import('@/test/shop-session')
    expect(await writeToRenter(null, form({ rentalId: claim.rentalId, body: 'Ring the bell at the back.', locale: 'en' }))).toMatchObject({ ok: true })
    jar.clear()
    expect((await sent()).slice(before).filter((message) => message.to === RENTER_PHONE).map((message) => message.data['page'])).toEqual(['claim', 'claim'])

    // No push Hold sent carries a renter link's token, a code, an email or the shop's words to the renter.
    const everything = JSON.stringify(await sent())
    for (const secret of [ready.token, claim.claimToken, 'priya@renter.example', 'Ring the bell']) expect(everything).not.toContain(secret)
  })

  it('registers only for the rental its link names, and refuses a changed link or a rental named in the body', async () => {
    const ready = await shop.readyRental()
    const other = await shop.readyRental()
    expect(await json(await registerRenter(ready.token, { pushToken: RENTER_PHONE, platform: 'ios', rentalId: other.rentalId }))).toMatchObject({ status: 400, body: { ok: false, failure: 'invalid' } })
    expect(await json(await registerRenter(`${ready.token.slice(0, -2)}xx`))).toMatchObject({ body: { ok: false, failure: 'link_invalid' } })
    expect(await json(await registerRenter(ready.token, { pushToken: 'https://evil.example/hook', platform: 'ios' }))).toMatchObject({ status: 400, body: { failure: 'invalid' } })
    expect(await json(await registerRenter(ready.token))).toMatchObject({ body: { ok: true } })
    const rows = (await inTheShop((transaction) => transaction.select().from(pushDevices))).filter((row) => row.expoPushToken === RENTER_PHONE)
    expect(rows.filter((row) => row.rentalId === other.rentalId)).toEqual([])
  })

  it('hears nothing once its link is revoked, or once it turns pushes off', async () => {
    const revoked = await shop.readyRental()
    await registerRenter(revoked.token, { pushToken: 'ExponentPushToken[revoked-link]', platform: 'android' })
    // Every link the shop has issued so far is revoked; later rentals get links of their own.
    await inTheShop((transaction) => transaction.update(renterLinks).set({ revokedAt: new Date() }))
    await pushToRenter(shop.shopId, revoked.rentalId, 'receipt')
    expect((await sent()).filter((message) => message.to === 'ExponentPushToken[revoked-link]')).toEqual([])

    const off = await shop.readyRental()
    await registerRenter(off.token, { pushToken: 'ExponentPushToken[turned-off]', platform: 'ios' })
    expect(await json(await rawAction('unregister-push', { authorization: `Bearer ${off.token}`, body: JSON.stringify({ pushToken: 'ExponentPushToken[turned-off]' }) }))).toMatchObject({ body: { ok: true } })
    await pushToRenter(shop.shopId, off.rentalId, 'receipt')
    expect((await sent()).filter((message) => message.to === 'ExponentPushToken[turned-off]')).toEqual([])
  })
})

describe('a member of staff’s phone', () => {
  it('registers as the bearer’s person in the shop they named, and hears what their role hears', async () => {
    const counter = await accessTokenOf(COUNTER)
    const reader = await accessTokenOf(READER)
    expect(await json(await staffAct('register-push', { token: counter, shopId: shop.shopId, body: { pushToken: 'ExponentPushToken[counter-phone]', platform: 'ios', locale: 'de' } }))).toMatchObject({ status: 200, body: { ok: true } })
    expect(await json(await staffAct('register-push', { token: reader, shopId: shop.shopId, body: { pushToken: 'ExponentPushToken[reader-phone]', platform: 'ios', locale: 'en' } }))).toMatchObject({ body: { ok: true } })
    const rentalId = (await shop.readyRental()).rentalId
    await pushToStaff(shop.shopId, 'drop_off_waiting', { to: 'drop_offs' })
    await pushToStaff(shop.shopId, 'decision_waiting', { to: 'rental', id: rentalId })
    expect((await sent()).filter((message) => message.to === 'ExponentPushToken[counter-phone]')).toEqual([{ to: 'ExponentPushToken[counter-phone]', title: 'Push Bikes', body: 'Eine Abgabe wartet auf die Prüfung.', data: { kind: 'staff', shopId: shop.shopId, path: '/shop/drop-offs' } }])
    // A read-only member is told nothing.
    expect((await sent()).filter((message) => message.to === 'ExponentPushToken[reader-phone]')).toEqual([])
  })

  it('cannot register in a shop the person does not work in, nor with a field more', async () => {
    const counter = await accessTokenOf(COUNTER)
    expect(await json(await staffAct('register-push', { token: counter, shopId: otherShopId, body: { pushToken: 'ExponentPushToken[forged-shop]', platform: 'ios', locale: 'en' } }))).toMatchObject({ body: { ok: false, failure: 'no_shop' } })
    expect(await json(await staffAct('register-push', { token: counter, shopId: shop.shopId, body: { pushToken: 'ExponentPushToken[forged-user]', platform: 'ios', locale: 'en', userId: shop.shopId } }))).toMatchObject({ body: { ok: false, failure: 'invalid' } })
    const { database } = await getServices()
    expect(await inShop(database, { role: 'hold_app', shopId: otherShopId }, (transaction) => transaction.select().from(pushDevices))).toEqual([])
  })

  it('stops hearing anything once the person signs out of the phone', async () => {
    const counter = await accessTokenOf(COUNTER)
    await staffAct('register-push', { token: counter, shopId: shop.shopId, body: { pushToken: 'ExponentPushToken[signing-out]', platform: 'android', locale: 'en' } })
    const headers = new Headers({ 'content-type': 'application/json', authorization: `Bearer ${counter}` })
    await signOutRoute.POST(new Request('https://hold.test/api/mobile/v1/session/sign-out', { method: 'POST', headers, body: JSON.stringify({ refreshToken: 'refresh', pushToken: 'ExponentPushToken[signing-out]' }) }), { params: Promise.resolve({}) })
    await pushToStaff(shop.shopId, 'renter_message', { to: 'drop_offs' })
    expect((await sent()).filter((message) => message.to === 'ExponentPushToken[signing-out]')).toEqual([])
  })

  it('is not signed out of pushes by a sign-out that names its phone without its person', async () => {
    const counter = await accessTokenOf(COUNTER)
    await staffAct('register-push', { token: counter, shopId: shop.shopId, body: { pushToken: 'ExponentPushToken[kept-phone]', platform: 'ios', locale: 'en' } })
    await signOutRoute.POST(new Request('https://hold.test/api/mobile/v1/session/sign-out', { method: 'POST', headers: new Headers({ 'content-type': 'application/json' }), body: JSON.stringify({ refreshToken: 'refresh', pushToken: 'ExponentPushToken[kept-phone]' }) }), { params: Promise.resolve({}) })
    await pushToStaff(shop.shopId, 'renter_message', { to: 'drop_offs' })
    expect((await sent()).filter((message) => message.to === 'ExponentPushToken[kept-phone]')).toHaveLength(1)
  })
})
