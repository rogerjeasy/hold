// @vitest-environment node
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { conditionReport, inShop, photoProvenance, rentalDetail } from '@hold/db'
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

const handover = await import('@/features/handover/actions')
const renter = await import('./actions')
const { getServices } = await import('@/server/services')
const { form, signIn } = await import('@/test/shop-session')
const { handoverShop } = await import('@/test/ready-rental')

vi.setConfig({ testTimeout: 30_000 })

const OWNER = 'owner@condition.example'
let shop: Awaited<ReturnType<typeof handoverShop>>
const QUALITY = { sharpness: '120', shadows: '20', highlights: '220', filled: '0.6' }
const jpeg = () => sharp({ create: { width: 320, height: 240, channels: 3, background: { r: Math.floor(Math.random() * 255), g: 90, b: 60 } } }).jpeg().toBuffer()
const sha = (body: Buffer) => createHash('sha256').update(body).digest('hex')
const inThisShop = async <Result>(work: Parameters<typeof inShop<Result>>[2]) => inShop((await getServices()).database, { role: 'hold_app', shopId: shop.shopId }, work)

// A rental handed over through the staff screens; the renter holds the condition link it ends with.
async function handedOver(): Promise<{ rentalId: string; itemId: string; token: string; bookingToken: string }> {
  const rental = await shop.readyRental()
  await signIn(jar, OWNER, 'email_code')
  const itemId = (await inThisShop((transaction) => rentalDetail(transaction, rental.rentalId, new Date())))?.items[0]?.id ?? ''
  const begun = await handover.startHandover(null, form({ rentalId: rental.rentalId, itemId, locale: 'en' }))
  if (!begun.ok) throw new Error(JSON.stringify(begun))
  for (const view of ['left-side', 'right-side']) {
    const body = await jpeg()
    const link = await handover.requestPhotoUpload(null, form({ sessionId: begun.value.sessionId, view, sha256: sha(body), bytes: String(body.length), locale: 'en' }))
    if (!link.ok) throw new Error(JSON.stringify(link))
    ;(await getServices()).simulatedEvidence?.receive(link.value.key, body, link.value.headers['x-amz-checksum-sha256'] ?? '')
    await handover.confirmPhotoUpload(null, form({ sessionId: begun.value.sessionId, view, key: link.value.key, ...QUALITY, locale: 'en' }))
  }
  const sealed = await handover.sealHandover(null, form({ sessionId: begun.value.sessionId, locale: 'en' }))
  if (!sealed.ok || sealed.value.conditionLink === undefined) throw new Error(JSON.stringify(sealed))
  jar.clear()
  return { rentalId: rental.rentalId, itemId, token: sealed.value.conditionLink.url.split('/r/')[1]?.split('/')[0] ?? '', bookingToken: rental.token }
}

beforeAll(async () => {
  shop = await handoverShop(jar, OWNER, 'Condition Bikes')
})

beforeEach(() => {
  forwarded.value = `203.0.113.${String(Math.floor(Math.random() * 250))}`
})

describe('the renter’s condition report', () => {
  it('takes the renter’s confirmation once', async () => {
    const { rentalId, token } = await handedOver()
    expect(await renter.confirmCondition(null, form({ token, locale: 'en' }))).toEqual({ ok: true, value: {} })
    expect(await renter.confirmCondition(null, form({ token, locale: 'en' }))).toEqual({ ok: false, failure: 'refused', reason: 'already_replied' })
    expect((await inThisShop((transaction) => conditionReport(transaction, rentalId, new Date())))?.reply).toBe('confirmed')
  })

  it('lets the renter add a photograph of something missed, then sends it with their answer', async () => {
    const { rentalId, itemId, token } = await handedOver()
    const body = await jpeg()
    const link = await renter.requestMissedUpload(null, form({ token, itemId, view: 'missed-1', sha256: sha(body), bytes: String(body.length), locale: 'en' }))
    if (!link.ok) throw new Error(JSON.stringify(link))
    ;(await getServices()).simulatedEvidence?.receive(link.value.key, body, link.value.headers['x-amz-checksum-sha256'] ?? '')
    expect(await renter.confirmMissedUpload(null, form({ token, itemId, view: 'missed-1', key: link.value.key, ...QUALITY, source: 'camera', locale: 'en' }))).toMatchObject({ ok: true })
    expect(await renter.sendMissed(null, form({ token, locale: 'en' }))).toEqual({ ok: true, value: {} })
    const report = await inThisShop((transaction) => conditionReport(transaction, rentalId, new Date()))
    expect(report?.reply).toBe('added')
    expect(report?.items[0]?.added.map((photo) => photo.view)).toEqual(['missed-1'])
    const key = report?.items[0]?.added[0]?.displayKey ?? ''
    expect((await inThisShop((transaction) => photoProvenance(transaction, [key]))).get(key)).toMatchObject({ takenBy: 'renter', source: 'camera' })
  })

  it('cannot be answered from the booking link, which may only view and pay', async () => {
    const { bookingToken } = await handedOver()
    expect(await renter.confirmCondition(null, form({ token: bookingToken, locale: 'en' }))).toEqual({ ok: false, failure: 'scope' })
  })

  it('sends nothing when nothing was added', async () => {
    const { token } = await handedOver()
    expect(await renter.sendMissed(null, form({ token, locale: 'en' }))).toEqual({ ok: false, failure: 'refused', reason: 'nothing_added' })
  })
})
