// @vitest-environment node
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { acceptInvitation, captureSession, createInvitation, inShop, listStaff, photoProvenance, rentalDetail } from '@hold/db'
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
      delete: (cookie: string | { name: string }) => jar.delete(typeof cookie === 'string' ? cookie : cookie.name),
    }),
  headers: () => Promise.resolve(new Headers({ 'x-forwarded-for': forwarded.value })),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({ getTranslations: () => Promise.resolve((key: string, values?: Record<string, unknown>) => `${key} ${JSON.stringify(values ?? {})}`) }))

const handover = await import('./actions')
const { getServices } = await import('@/server/services')
const { form, signIn } = await import('@/test/shop-session')
const { handoverShop } = await import('@/test/ready-rental')

vi.setConfig({ testTimeout: 30_000 })

const OWNER = 'owner@handover.example'
let shop: Awaited<ReturnType<typeof handoverShop>>

// A real JPEG, different every time, as the phone's camera makes.
const jpeg = () => sharp({ create: { width: 640, height: 480, channels: 3, background: { r: Math.floor(Math.random() * 255), g: 120, b: 80 } } }).jpeg().toBuffer()
const sha = (body: Buffer) => createHash('sha256').update(body).digest('hex')
const QUALITY = { sharpness: '120', shadows: '20', highlights: '220', filled: '0.6' }

async function started(count = 1) {
  const rental = await shop.readyRental(count)
  await signIn(jar, OWNER, 'email_code')
  const itemId = (await inShop((await getServices()).database, { role: 'hold_app', shopId: shop.shopId }, (transaction) => rentalDetail(transaction, rental.rentalId, new Date())))?.items[0]?.id ?? ''
  const begun = await handover.startHandover(null, form({ rentalId: rental.rentalId, itemId, locale: 'en' }))
  if (!begun.ok) throw new Error(JSON.stringify(begun))
  return { ...rental, sessionId: begun.value.sessionId }
}

// What the phone does for one view: asks for a link, puts the photograph there, then says it is done.
async function photograph(sessionId: string, view: string, given?: Buffer, source = 'camera') {
  const body = given ?? (await jpeg())
  const link = await handover.requestPhotoUpload(null, form({ sessionId, view, sha256: sha(body), bytes: String(body.length), locale: 'en' }))
  if (!link.ok) throw new Error(JSON.stringify(link))
  const store = (await getServices()).simulatedEvidence
  expect(store?.receive(link.value.key, body, link.value.headers['x-amz-checksum-sha256'] ?? '')).toBe('stored')
  return handover.confirmPhotoUpload(null, form({ sessionId, view, key: link.value.key, ...QUALITY, source, locale: 'en' }))
}

beforeAll(async () => {
  shop = await handoverShop(jar, OWNER, 'Handover Bikes')
  const { database } = await getServices()
  const ownerId = (await inShop(database, { role: 'hold_app', shopId: shop.shopId }, listStaff))[0]?.userId ?? ''
  const { token } = await inShop(database, { role: 'hold_app', shopId: shop.shopId, userId: ownerId }, (transaction) =>
    createInvitation(transaction, { shopId: shop.shopId, invitedByUserId: ownerId, email: 'reader@handover.example', role: 'read_only', approvalLimitCents: 0, language: 'en' }, new Date()),
  )
  const reader = await signIn(jar, 'reader@handover.example', 'email_code')
  await acceptInvitation(database, { token, subject: reader, email: 'reader@handover.example', name: 'Reader', language: 'en' }, new Date())
})

beforeEach(() => {
  forwarded.value = `203.0.113.${String(Math.floor(Math.random() * 250))}`
})

describe('the guided handover', () => {
  it('records each view from the store’s own fingerprint, and hands the rental over once sealed', async () => {
    const { rentalId, sessionId } = await started()
    const body = await jpeg()
    expect(await photograph(sessionId, 'left-side', body)).toMatchObject({ ok: true })
    // Its display copy is made as soon as the photograph is recorded.
    const shown = await inShop((await getServices()).database, { role: 'hold_app', shopId: shop.shopId }, (transaction) => captureSession(transaction, sessionId))
    expect(shown?.photos[0]?.displayKey).toBeTruthy()
    expect((await getServices()).simulatedEvidence?.displayed(shown?.photos[0]?.displayKey ?? '')).toBeDefined()
    expect(await handover.sealHandover(null, form({ sessionId, locale: 'en' }))).toEqual({ ok: false, failure: 'refused', reason: 'views_missing' })
    expect(await photograph(sessionId, 'right-side')).toMatchObject({ ok: true })

    const sealed = await handover.sealHandover(null, form({ sessionId, locale: 'en' }))
    if (!sealed.ok) throw new Error(JSON.stringify(sealed))
    expect(sealed.value.rentalOut).toBe(true)
    expect(sealed.value.conditionLink?.url).toMatch(/\/r\/[A-Za-z0-9_-]{65}\/condition$/)
    const { database, mailer } = await getServices()
    expect((await inShop(database, { role: 'hold_app', shopId: shop.shopId }, (transaction) => rentalDetail(transaction, rentalId, new Date())))?.state).toBe('out')
    const session = await inShop(database, { role: 'hold_app', shopId: shop.shopId }, (transaction) => captureSession(transaction, sessionId))
    expect(session?.photos.map((photo) => photo.view)).toEqual(['left-side', 'right-side'])
    const sent = (mailer as unknown as { sent: { to: string; text: string }[] }).sent.at(-1)
    expect(sent?.to).toBe('priya@renter.example')
    expect(sent?.text).toContain('/condition')
  })

  it('keeps, under each photograph, whether Hold’s camera took it or a file was chosen', async () => {
    const { sessionId } = await started()
    expect(await photograph(sessionId, 'left-side', undefined, 'camera')).toMatchObject({ ok: true })
    expect(await photograph(sessionId, 'right-side', undefined, 'file')).toMatchObject({ ok: true })
    const { database } = await getServices()
    const sources = await inShop(database, { role: 'hold_app', shopId: shop.shopId }, async (transaction) => {
      const session = await captureSession(transaction, sessionId)
      const keys = session?.photos.map((photo) => photo.displayKey ?? '') ?? []
      const found = await photoProvenance(transaction, keys)
      return keys.map((key) => found.get(key)?.source)
    })
    expect(sources).toEqual(['camera', 'file'])
  })

  it('refuses a photograph that never reached the store', async () => {
    const { sessionId } = await started()
    const body = await jpeg()
    const link = await handover.requestPhotoUpload(null, form({ sessionId, view: 'left-side', sha256: sha(body), bytes: String(body.length), locale: 'en' }))
    if (!link.ok) throw new Error(JSON.stringify(link))
    expect(await handover.confirmPhotoUpload(null, form({ sessionId, view: 'left-side', key: link.value.key, ...QUALITY, locale: 'en' }))).toEqual({ ok: false, failure: 'refused', reason: 'not_uploaded' })
  })

  it('refuses a stored photograph from another session or view', async () => {
    const first = await started()
    const second = await started()
    const body = await jpeg()
    const link = await handover.requestPhotoUpload(null, form({ sessionId: first.sessionId, view: 'left-side', sha256: sha(body), bytes: String(body.length), locale: 'en' }))
    if (!link.ok) throw new Error(JSON.stringify(link))
    ;(await getServices()).simulatedEvidence?.receive(link.value.key, body, link.value.headers['x-amz-checksum-sha256'] ?? '')
    expect(await handover.confirmPhotoUpload(null, form({ sessionId: second.sessionId, view: 'left-side', key: link.value.key, ...QUALITY, locale: 'en' }))).toEqual({ ok: false, failure: 'refused', reason: 'key_mismatch' })
    expect(await handover.confirmPhotoUpload(null, form({ sessionId: first.sessionId, view: 'right-side', key: link.value.key, ...QUALITY, locale: 'en' }))).toEqual({ ok: false, failure: 'refused', reason: 'key_mismatch' })
  })

  it('refuses a photograph larger than the store takes', async () => {
    const { sessionId } = await started()
    expect(await handover.requestPhotoUpload(null, form({ sessionId, view: 'left-side', sha256: 'a'.repeat(64), bytes: String(16 * 1024 * 1024), locale: 'en' }))).toMatchObject({ ok: false, failure: 'invalid' })
  })

  it('records a mark drawn on a view', async () => {
    const { sessionId } = await started()
    expect(await handover.addHandoverMark(null, form({ sessionId, view: 'left-side', x: '0.1', y: '0.2', width: '0.2', height: '0.1', description: 'Scuff on the top tube', locale: 'en' }))).toMatchObject({ ok: true })
    expect(await handover.addHandoverMark(null, form({ sessionId, view: 'left-side', x: '0.9', y: '0.2', width: '0.2', height: '0.1', description: 'Off the edge', locale: 'en' }))).toEqual({ ok: false, failure: 'refused', reason: 'region_invalid' })
  })

  it('is closed to read-only members', async () => {
    const { sessionId } = await started()
    await signIn(jar, 'reader@handover.example', 'email_code')
    expect(await handover.requestPhotoUpload(null, form({ sessionId, view: 'left-side', sha256: 'a'.repeat(64), bytes: '100', locale: 'en' }))).toEqual({ ok: false, failure: 'role' })
    expect(await handover.sealHandover(null, form({ sessionId, locale: 'en' }))).toEqual({ ok: false, failure: 'role' })
  })

  it('finds no session of another shop', async () => {
    const { sessionId } = await started()
    await handoverShop(jar, 'owner@other-handover.example', 'Other Handover Bikes')
    await signIn(jar, 'owner@other-handover.example', 'email_code')
    expect(await handover.sealHandover(null, form({ sessionId, locale: 'en' }))).toEqual({ ok: false, failure: 'refused', reason: 'not_found' })
  })
})
