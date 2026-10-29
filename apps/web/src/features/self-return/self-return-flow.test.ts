// @vitest-environment node
import { createHash, randomBytes } from 'node:crypto'
import { DROP_POINT_VIEW } from '@hold/domain'
import { acceptInvitation, auditLog, createInvitation, inShop, listStaff, rentalDetail, rentalHold, selfReturnFor } from '@hold/db'
import sharp from 'sharp'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 9).toString('base64')
const jar = new Map<string, string>()
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: (name: string) => jar.has(name) ? { name, value: jar.get(name) } : undefined, set: (name: string, value: string) => jar.set(name, value), delete: (name: string) => jar.delete(name) }), headers: () => Promise.resolve(new Headers()) }))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({ getTranslations: () => Promise.resolve((key: string) => key) }))
const handover = await import('@/features/handover/actions')
const staff = await import('./actions')
const renter = await import('./renter-actions')
const { getServices } = await import('@/server/services')
const { form, signIn } = await import('@/test/shop-session')
const { handoverShop } = await import('@/test/ready-rental')
vi.setConfig({ testTimeout: 30_000 })

const OWNER = 'owner@self-return.example'
const QUALITY = { sharpness: '120', shadows: '20', highlights: '220', filled: '0.6' }
const SETTINGS = { allowed: 'on', dropPoint: 'The locked rack left of the door.', opens: '09:00', closes: '19:00', locale: 'en' }
let shop: Awaited<ReturnType<typeof handoverShop>>

// A photograph of its own for each view, so none repeats earlier evidence.
const picture = () => sharp(randomBytes(64 * 48 * 3), { raw: { width: 64, height: 48, channels: 3 } }).resize(640, 480).jpeg().toBuffer()

async function staffPhotographed(sessionId: string) {
  for (const view of ['left-side', 'right-side']) {
    const body = await picture()
    const link = await handover.requestPhotoUpload(null, form({ sessionId, view, sha256: createHash('sha256').update(body).digest('hex'), bytes: String(body.length), locale: 'en' }))
    if (!link.ok) throw new Error(JSON.stringify(link))
    ;(await getServices()).simulatedEvidence?.receive(link.value.key, body, link.value.headers['x-amz-checksum-sha256'] ?? '')
    await handover.confirmPhotoUpload(null, form({ sessionId, view, key: link.value.key, ...QUALITY, locale: 'en' }))
  }
}

async function renterPhotograph(token: string, sessionId: string, view: string, body?: Buffer) {
  const photo = body ?? await picture()
  const link = await renter.requestSelfReturnUpload(null, form({ token, sessionId, view, sha256: createHash('sha256').update(photo).digest('hex'), bytes: String(photo.length), locale: 'en' }))
  if (!link.ok) return link
  ;(await getServices()).simulatedEvidence?.receive(link.value.key, photo, link.value.headers['x-amz-checksum-sha256'] ?? '')
  return renter.confirmSelfReturnUpload(null, form({ token, sessionId, view, key: link.value.key, ...QUALITY, locale: 'en' }))
}

async function handedOver() {
  await signIn(jar, OWNER, 'email_code')
  const rental = await shop.readyRental()
  const { database } = await getServices()
  const itemId = (await inShop(database, { role: 'hold_app', shopId: shop.shopId }, (transaction) => rentalDetail(transaction, rental.rentalId, new Date())))?.items[0]?.id ?? ''
  const begun = await handover.startHandover(null, form({ rentalId: rental.rentalId, itemId, locale: 'en' }))
  if (!begun.ok) throw new Error(JSON.stringify(begun))
  await staffPhotographed(begun.value.sessionId)
  await handover.sealHandover(null, form({ sessionId: begun.value.sessionId, locale: 'en' }))
  jar.clear()
  return rental
}

async function droppedOff() {
  const rental = await handedOver()
  const started = await renter.startSelfReturn(null, form({ token: rental.token, locale: 'en' }))
  if (!started.ok) throw new Error(JSON.stringify(started))
  const sessionId = started.value.sessionIds[0] ?? ''
  for (const view of ['left-side', 'right-side', DROP_POINT_VIEW]) {
    const taken = await renterPhotograph(rental.token, sessionId, view)
    if (!taken.ok) throw new Error(JSON.stringify(taken))
  }
  const sent = await renter.sendSelfReturn(null, form({ token: rental.token, locale: 'en' }))
  if (!sent.ok) throw new Error(JSON.stringify(sent))
  return { ...rental, sessionId }
}

const inTheShop = async <Result>(work: Parameters<typeof inShop<Result>>[2]) => inShop((await getServices()).database, { role: 'hold_app', shopId: shop.shopId }, work)
const returnOf = (rentalId: string) => inTheShop((transaction) => selfReturnFor(transaction, rentalId))

beforeAll(async () => {
  shop = await handoverShop(jar, OWNER, 'Self Return Bikes')
  const { database } = await getServices()
  const ownerId = (await inShop(database, { role: 'hold_app', shopId: shop.shopId }, listStaff))[0]?.userId ?? ''
  for (const [email, role] of [['counter@self-return.example', 'counter_staff'], ['reader@self-return.example', 'read_only']] as const) {
    const invitation = await inShop(database, { role: 'hold_app', shopId: shop.shopId, userId: ownerId }, (transaction) => createInvitation(transaction, { shopId: shop.shopId, invitedByUserId: ownerId, email, role, approvalLimitCents: 0, language: 'en' }, new Date()))
    const subject = await signIn(jar, email, 'email_code')
    await acceptInvitation(database, { token: invitation.token, subject, email, name: role === 'counter_staff' ? 'Jonas' : 'Reader', language: 'en' }, new Date())
  }
})
beforeEach(() => { jar.clear() })

describe('the shop’s self-return settings', () => {
  it('are changed by the owner alone, and checked', async () => {
    await signIn(jar, 'counter@self-return.example', 'email_code')
    expect(await staff.saveSelfReturnSettings(null, form(SETTINGS))).toEqual({ ok: false, failure: 'role' })
    await signIn(jar, OWNER, 'email_code')
    expect(await staff.saveSelfReturnSettings(null, form({ ...SETTINGS, dropPoint: ' ' }))).toMatchObject({ ok: false, reason: 'drop_point_needed' })
    expect(await staff.saveSelfReturnSettings(null, form({ ...SETTINGS, opens: '19:00', closes: '09:00' }))).toMatchObject({ ok: false, reason: 'hours_invalid' })
    expect(await staff.saveSelfReturnSettings(null, form({ ...SETTINGS, extra: '1' }))).toMatchObject({ ok: false, failure: 'invalid' })
    expect(await staff.saveSelfReturnSettings(null, form(SETTINGS))).toMatchObject({ ok: true })
  })
})

describe('a renter returning the item through their link', () => {
  it('is refused while the shop does not allow it', async () => {
    await signIn(jar, OWNER, 'email_code')
    await staff.saveSelfReturnSettings(null, form({ ...SETTINGS, allowed: 'off' }))
    const rental = await handedOver()
    expect(await renter.startSelfReturn(null, form({ token: rental.token, locale: 'en' }))).toMatchObject({ ok: false, reason: 'not_allowed' })
    await signIn(jar, OWNER, 'email_code')
    await staff.saveSelfReturnSettings(null, form(SETTINGS))
  })

  it('is refused for a changed link, and before the handover', async () => {
    expect(await renter.startSelfReturn(null, form({ token: 'not-a-real-token', locale: 'en' }))).toEqual({ ok: false, failure: 'link_invalid' })
    await signIn(jar, OWNER, 'email_code')
    const rental = await shop.readyRental()
    jar.clear()
    expect(await renter.startSelfReturn(null, form({ token: rental.token, locale: 'en' }))).toMatchObject({ ok: false, reason: 'not_ready' })
  })

  it('asks again for a photograph that repeats earlier evidence', async () => {
    const rental = await handedOver()
    const started = await renter.startSelfReturn(null, form({ token: rental.token, locale: 'en' }))
    if (!started.ok) throw new Error(JSON.stringify(started))
    const repeated = await picture()
    expect(await renterPhotograph(rental.token, started.value.sessionIds[0] ?? '', 'left-side', repeated)).toMatchObject({ ok: true })
    expect(await renterPhotograph(rental.token, started.value.sessionIds[0] ?? '', 'right-side', repeated)).toMatchObject({ ok: false, reason: 'photo_reused' })
  })

  it('cannot put photographs into another rental’s return', async () => {
    const first = await droppedOff()
    const second = await handedOver()
    await renter.startSelfReturn(null, form({ token: second.token, locale: 'en' }))
    expect(await renterPhotograph(second.token, first.sessionId, 'left-side')).toMatchObject({ ok: false, reason: 'not_found' })
  })

  it('leaves the rental dropped off with the hold in place, and is recorded', async () => {
    const rental = await droppedOff()
    const own = await returnOf(rental.rentalId)
    expect(own?.state).toBe('dropped_off')
    expect(own?.droppedOffAt).toBeInstanceOf(Date)
    expect((await inTheShop((transaction) => rentalHold(transaction, rental.rentalId)))?.state).toBe('placed')
    const { database } = await getServices()
    expect((await database.select().from(auditLog)).some((row) => row.action === 'renter.self_return_sent' && row.subjectId === rental.rentalId)).toBe(true)
  })
})

describe('a person checking an item a renter dropped off', () => {
  it('may be counter staff, and not someone who only reads', async () => {
    const rental = await droppedOff()
    await signIn(jar, 'reader@self-return.example', 'email_code')
    expect(await staff.confirmDropOff(null, form({ rentalId: rental.rentalId, locale: 'en' }))).toEqual({ ok: false, failure: 'role' })
    expect(await staff.reportDropOffMissing(null, form({ rentalId: rental.rentalId, locale: 'en' }))).toEqual({ ok: false, failure: 'role' })
    await signIn(jar, 'counter@self-return.example', 'email_code')
    expect(await staff.confirmDropOff(null, form({ rentalId: rental.rentalId, locale: 'en' }))).toMatchObject({ ok: true })
    expect((await returnOf(rental.rentalId))?.state).toBe('returned')
  })

  it('records who could not find it, tells the renter with a link to their return, and the hold stays', async () => {
    const rental = await droppedOff()
    await signIn(jar, 'counter@self-return.example', 'email_code')
    expect(await staff.reportDropOffMissing(null, form({ rentalId: rental.rentalId, locale: 'en' }))).toMatchObject({ ok: true, value: { emailed: true } })
    const { mailer } = await getServices()
    const sent = (mailer as unknown as { sent: readonly { to: string; subject: string; text: string }[] }).sent.at(-1)
    expect(sent?.to).toBe('renter@fake-paypal.test')
    expect(sent?.text).toMatch(/\/r\/[^/\s]+\/return/)
    const own = await returnOf(rental.rentalId)
    expect(own?.state).toBe('dropped_off')
    expect(own?.missingAt).toBeInstanceOf(Date)
  })

  it('finds nothing in another shop', async () => {
    const rental = await droppedOff()
    await handoverShop(jar, 'owner@other-self-return.example', 'Other Self Return Bikes')
    expect(await staff.confirmDropOff(null, form({ rentalId: rental.rentalId, locale: 'en' }))).toMatchObject({ ok: false, reason: 'not_found' })
  })
})
