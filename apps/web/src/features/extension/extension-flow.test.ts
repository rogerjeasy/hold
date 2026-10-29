// @vitest-environment node
import { createHash, randomBytes } from 'node:crypto'
import { shopTimeText } from '@hold/domain'
import { acceptInvitation, createInvitation, inShop, rentalDetail, rentalExtensionsOf, staffRoles } from '@hold/db'
import type { TestDatabase } from '@hold/db/testing'
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

const OWNER = 'owner@extension.example'
const QUALITY = { sharpness: '120', shadows: '20', highlights: '220', filled: '0.6' }
const HOUR = 3_600_000
let shop: Awaited<ReturnType<typeof handoverShop>>

const picture = () => sharp(randomBytes(64 * 48 * 3), { raw: { width: 64, height: 48, channels: 3 } }).resize(640, 480).jpeg().toBuffer()
const inTheShop = async <Result>(work: Parameters<typeof inShop<Result>>[2]) => inShop((await getServices()).database, { role: 'hold_app', shopId: shop.shopId }, work)
const detail = (rentalId: string) => inTheShop((transaction) => rentalDetail(transaction, rentalId, new Date()))
const orderOf = (approvalUrl: string) => approvalUrl.split('/').at(-1) ?? ''
// A new end on the shop's clock, as the renter's form sends it. The test shops keep UTC.
const local = (at: Date) => shopTimeText('UTC', at)

async function out() {
  await signIn(jar, OWNER, 'email_code')
  const rental = await shop.readyRental()
  const itemId = (await detail(rental.rentalId))?.items[0]?.id ?? ''
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
  const endsAt = (await detail(rental.rentalId))?.endsAt
  if (endsAt === undefined) throw new Error('No rental.')
  return { ...rental, endsAt }
}

beforeAll(async () => {
  shop = await handoverShop(jar, OWNER, 'Extension Bikes')
})
beforeEach(() => { jar.clear() })

describe('the most extra days a renter may add', () => {
  it('is set by the owner alone, between none and four weeks', async () => {
    expect(await staff.saveExtensionSettings(null, form({ maxDays: '5', locale: 'en' }))).toEqual({ ok: false, failure: 'signed_out' })
    await signIn(jar, OWNER, 'email_code')
    expect(await staff.saveExtensionSettings(null, form({ maxDays: '29', locale: 'en' }))).toMatchObject({ ok: false, failure: 'invalid' })
    expect(await staff.saveExtensionSettings(null, form({ maxDays: '7', locale: 'en' }))).toMatchObject({ ok: true })
  })
})

describe('a renter keeping the item longer', () => {
  it('is priced by Hold, paid in PayPal, and moves the end at once, with nobody to ask', async () => {
    const rental = await out()
    const newEnd = new Date(rental.endsAt.getTime() + 48 * HOUR)
    const quoted = await renter.askExtension(null, form({ token: rental.token, endsAt: local(newEnd), locale: 'en' }))
    expect(quoted).toMatchObject({ ok: true, value: { extraDays: 2, feeCents: 80_00, currency: 'EUR' } })
    const started = await renter.payExtension(null, form({ token: rental.token, locale: 'en' }))
    if (!started.ok) throw new Error(JSON.stringify(started))
    expect(started.value.returnUrl).toContain('/extended?token=')
    expect(await renter.confirmExtension(null, form({ token: rental.token, orderId: orderOf(started.value.approvalUrl), locale: 'en' }))).toMatchObject({ ok: false, reason: 'not_approved' })
    ;(await getServices()).simulatedPayPal?.approveOrder(orderOf(started.value.approvalUrl))
    expect(await renter.confirmExtension(null, form({ token: rental.token, orderId: orderOf(started.value.approvalUrl), locale: 'en' }))).toMatchObject({ ok: true })
    expect((await detail(rental.rentalId))?.endsAt).toEqual(newEnd)
    expect((await inTheShop((transaction) => rentalExtensionsOf(transaction, rental.rentalId)))[0]).toMatchObject({ state: 'paid', amountCents: 80_00, askedThrough: 'link' })
  })

  it('says why it cannot, in terms the renter can act on', async () => {
    const rental = await out()
    expect(await renter.askExtension(null, form({ token: rental.token, endsAt: local(new Date(rental.endsAt.getTime() + 9 * 24 * HOUR)), locale: 'en' }))).toMatchObject({ ok: false, reason: 'too_many_days:7' })
    expect(await renter.askExtension(null, form({ token: rental.token, endsAt: 'not a date', locale: 'en' }))).toMatchObject({ ok: false, failure: 'invalid' })
    expect(await renter.askExtension(null, form({ token: rental.token, endsAt: local(new Date(rental.endsAt.getTime() - HOUR)), locale: 'en' }))).toMatchObject({ ok: false, reason: 'not_later' })
    expect(await renter.payExtension(null, form({ token: rental.token, locale: 'en' }))).toMatchObject({ ok: false, reason: 'no_quote' })
    expect(await renter.askExtension(null, form({ token: 'not-a-real-token', endsAt: local(rental.endsAt), locale: 'en' }))).toEqual({ ok: false, failure: 'link_invalid' })
  })

  it('tells the renter PayPal is reviewing the payment, while the new end holds', async () => {
    const rental = await out()
    const newEnd = new Date(rental.endsAt.getTime() + 24 * HOUR)
    await renter.askExtension(null, form({ token: rental.token, endsAt: local(newEnd), locale: 'en' }))
    const started = await renter.payExtension(null, form({ token: rental.token, locale: 'en' }))
    if (!started.ok) throw new Error(JSON.stringify(started))
    ;(await getServices()).simulatedPayPal?.approveOrder(orderOf(started.value.approvalUrl), { capture: 'review' })
    expect(await renter.confirmExtension(null, form({ token: rental.token, orderId: orderOf(started.value.approvalUrl), locale: 'en' }))).toMatchObject({ ok: true, value: { state: 'reviewing' } })
    expect((await detail(rental.rentalId))?.endsAt).toEqual(newEnd)
    expect((await inTheShop((transaction) => rentalExtensionsOf(transaction, rental.rentalId)))[0]).toMatchObject({ state: 'capturing' })
  })

  it('says plainly when PayPal denied the payment, and the old end is back', async () => {
    const { sendSimulatedEvent } = await import('@/server/simulated-paypal-event')
    const rental = await out()
    await renter.askExtension(null, form({ token: rental.token, endsAt: local(new Date(rental.endsAt.getTime() + 24 * HOUR)), locale: 'en' }))
    const started = await renter.payExtension(null, form({ token: rental.token, locale: 'en' }))
    if (!started.ok) throw new Error(JSON.stringify(started))
    const orderId = orderOf(started.value.approvalUrl)
    const { simulatedPayPal } = await getServices()
    simulatedPayPal?.approveOrder(orderId, { capture: 'review' })
    expect(await renter.confirmExtension(null, form({ token: rental.token, orderId, locale: 'en' }))).toMatchObject({ ok: true, value: { state: 'reviewing' } })
    const captureId = simulatedPayPal?.finishReview(orderId, 'declined') ?? ''
    await sendSimulatedEvent(orderId, `WH-TEST-DENIED-${captureId}`, 'PAYMENT.CAPTURE.DENIED', { id: captureId })
    expect(await renter.confirmExtension(null, form({ token: rental.token, orderId, locale: 'en' }))).toMatchObject({ ok: false, failure: 'refused', reason: 'declined' })
    expect((await detail(rental.rentalId))?.endsAt).toEqual(rental.endsAt)
  })

  it('cannot pay one rental’s extension with another’s order', async () => {
    const first = await out()
    const second = await out()
    await renter.askExtension(null, form({ token: first.token, endsAt: local(new Date(first.endsAt.getTime() + 24 * HOUR)), locale: 'en' }))
    const started = await renter.payExtension(null, form({ token: first.token, locale: 'en' }))
    if (!started.ok) throw new Error(JSON.stringify(started))
    ;(await getServices()).simulatedPayPal?.approveOrder(orderOf(started.value.approvalUrl))
    expect(await renter.confirmExtension(null, form({ token: second.token, orderId: orderOf(started.value.approvalUrl), locale: 'en' }))).toMatchObject({ ok: false, reason: 'order_mismatch' })
  })
})

describe('money PayPal moved for extra days that Hold did not apply', () => {
  const COUNTER = 'counter@extension.example'
  const OTHER_OWNER = 'owner@other-extension.example'

  // An extension the worker put before a person: PayPal completed its capture after Hold had stopped waiting.
  async function paidAfterExpiry() {
    const rental = await out()
    await renter.askExtension(null, form({ token: rental.token, endsAt: local(new Date(rental.endsAt.getTime() + 24 * HOUR)), locale: 'en' }))
    const started = await renter.payExtension(null, form({ token: rental.token, locale: 'en' }))
    if (!started.ok) throw new Error(JSON.stringify(started))
    const [extension] = await inTheShop((transaction) => rentalExtensionsOf(transaction, rental.rentalId))
    if (extension === undefined) throw new Error('No extension.')
    const { database } = await getServices()
    await (database as unknown as TestDatabase).$client.query("update rental_extensions set attention = 'paid_after_expiry', attention_at = now(), captured_cents = 4000, paypal_capture_id = 'CAPTURE-LATE' where id = $1", [extension.id])
    return extension.id
  }

  async function joinAsCounter() {
    const { database } = await getServices()
    const ownerId = (await database.select().from(staffRoles)).find((row) => row.shopId === shop.shopId && row.role === 'owner')?.userId ?? ''
    const { token } = await inShop(database, { role: 'hold_app', shopId: shop.shopId, userId: ownerId }, (transaction) =>
      createInvitation(transaction, { shopId: shop.shopId, invitedByUserId: ownerId, email: COUNTER, role: 'counter_staff', approvalLimitCents: 0, language: 'en' }, new Date()),
    )
    const subject = await signIn(jar, COUNTER, 'passkey')
    await acceptInvitation(database, { token, subject, email: COUNTER, name: 'Counter', language: 'en' }, new Date())
  }

  it('is marked checked by an owner or manager of the shop alone, once', async () => {
    const extensionId = await paidAfterExpiry()
    expect(await staff.checkExtensionPayment(null, form({ extensionId, locale: 'en' }))).toEqual({ ok: false, failure: 'signed_out' })
    await joinAsCounter()
    expect(await staff.checkExtensionPayment(null, form({ extensionId, locale: 'en' }))).toEqual({ ok: false, failure: 'role' })
    jar.clear()
    await handoverShop(jar, OTHER_OWNER, 'Other Extension Bikes')
    expect(await staff.checkExtensionPayment(null, form({ extensionId, locale: 'en' }))).toMatchObject({ ok: false, reason: 'not_found' })
    jar.clear()
    await signIn(jar, OWNER, 'passkey')
    expect(await staff.checkExtensionPayment(null, form({ extensionId, extra: 'x', locale: 'en' }))).toMatchObject({ ok: false, failure: 'invalid' })
    expect(await staff.checkExtensionPayment(null, form({ extensionId, locale: 'en' }))).toMatchObject({ ok: true })
    expect(await staff.checkExtensionPayment(null, form({ extensionId, locale: 'en' }))).toMatchObject({ ok: false, reason: 'already_checked' })
  })
})
