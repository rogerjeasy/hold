// @vitest-environment node
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { acceptInvitation, auditLog, captureSession, claimWorkspace, comparisonReport, createInvitation, inShop, listStaff, photos, rentalDetail, rentalReturns } from '@hold/db'
import sharp from 'sharp'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 9).toString('base64')
const jar = new Map<string, string>()
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: (name: string) => jar.has(name) ? { name, value: jar.get(name) } : undefined, set: (name: string, value: string) => jar.set(name, value), delete: (name: string) => jar.delete(name) }), headers: () => Promise.resolve(new Headers()) }))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({ getTranslations: () => Promise.resolve((key: string) => key) }))
const handover = await import('@/features/handover/actions')
const returns = await import('./actions')
const claims = await import('@/features/claims/actions')
const { getServices } = await import('@/server/services')
const { form, signIn } = await import('@/test/shop-session')
const { handoverShop } = await import('@/test/ready-rental')
vi.setConfig({ testTimeout: 30_000 })

const OWNER = 'owner@return-flow.example'
const QUALITY = { sharpness: '120', shadows: '20', highlights: '220', filled: '0.6' }
let shop: Awaited<ReturnType<typeof handoverShop>>

const sample = (file: string) => readFileSync(new URL(`../../../public/images/${file}`, import.meta.url))

// samples: the handover too is the demonstration's sample photograph, so the return's sample with damage lines up on it.
async function photographed(sessionId: string, kind: 'handover' | 'return', samples = false) {
  const actions = kind === 'handover' ? handover : returns
  for (const view of ['left-side', 'right-side']) {
    // The return uses the demonstration's sample with damage, which the server knows as a sample by its fingerprint.
    const body = kind === 'return' ? sample('sample-return-damage.jpg') : samples ? sample('sample-handover.jpg') : await sharp({ create: { width: 640, height: 480, channels: 3, background: 'grey' } }).jpeg().toBuffer()
    const link = await actions.requestPhotoUpload(null, form({ sessionId, view, sha256: createHash('sha256').update(body).digest('hex'), bytes: String(body.length), locale: 'en' }))
    if (!link.ok) throw new Error(JSON.stringify(link))
    ;(await getServices()).simulatedEvidence?.receive(link.value.key, body, link.value.headers['x-amz-checksum-sha256'] ?? '')
    expect(await actions.confirmPhotoUpload(null, form({ sessionId, view, key: link.value.key, ...QUALITY, locale: 'en' }))).toMatchObject({ ok: true })
  }
}

async function handedOver(samples = false) {
  await signIn(jar, OWNER, 'email_code')
  const rental = await shop.readyRental()
  const { database } = await getServices()
  const itemId = (await inShop(database, { role: 'hold_app', shopId: shop.shopId }, (transaction) => rentalDetail(transaction, rental.rentalId, new Date())))?.items[0]?.id ?? ''
  const begun = await handover.startHandover(null, form({ rentalId: rental.rentalId, itemId, locale: 'en' }))
  if (!begun.ok) throw new Error(JSON.stringify(begun))
  await photographed(begun.value.sessionId, 'handover', samples)
  await handover.sealHandover(null, form({ sessionId: begun.value.sessionId, locale: 'en' }))
  return { ...rental, itemId, handoverId: begun.value.sessionId }
}

beforeAll(async () => {
  shop = await handoverShop(jar, OWNER, 'Return Bikes')
  const { database } = await getServices()
  const ownerId = (await inShop(database, { role: 'hold_app', shopId: shop.shopId }, listStaff))[0]?.userId ?? ''
  const invitation = await inShop(database, { role: 'hold_app', shopId: shop.shopId, userId: ownerId }, (transaction) => createInvitation(transaction, { shopId: shop.shopId, invitedByUserId: ownerId, email: 'reader@return-flow.example', role: 'read_only', approvalLimitCents: 0, language: 'en' }, new Date()))
  const subject = await signIn(jar, 'reader@return-flow.example', 'email_code')
  await acceptInvitation(database, { token: invitation.token, subject, email: 'reader@return-flow.example', name: 'Reader', language: 'en' }, new Date())
})
beforeEach(() => { jar.clear() })

describe('the staff return flow', () => {
  it('photographs and seals an outstanding rental and exposes its queued comparison', async () => {
    const rental = await handedOver()
    const begun = await returns.startReturn(null, form({ rentalId: rental.rentalId, itemId: rental.itemId, locale: 'en' }))
    expect(begun.ok).toBe(true)
    if (!begun.ok) throw new Error(JSON.stringify(begun))
    expect(await returns.sealReturn(null, form({ sessionId: begun.value.sessionId, locale: 'en' }))).toMatchObject({ ok: false, reason: 'views_missing' })
    await photographed(begun.value.sessionId, 'return')
    expect(await returns.sealReturn(null, form({ sessionId: begun.value.sessionId, locale: 'en' }))).toMatchObject({ ok: true, value: { rentalReturned: true } })
    const { database } = await getServices()
    const evidence = await inShop(database, { role: 'hold_app', shopId: shop.shopId }, (transaction) => captureSession(transaction, begun.value.sessionId))
    expect(evidence?.sealedAt).not.toBeNull()
    expect((await database.select().from(photos)).filter((photo) => photo.sessionId === begun.value.sessionId).every((photo) => photo.quality?.['simulated'] === 1)).toBe(true)
    expect((await inShop(database, { role: 'hold_app', shopId: shop.shopId }, (transaction) => rentalReturns(transaction, rental.rentalId)))[0]?.comparisonId).toBeTruthy()
    expect((await database.select().from(auditLog)).some((row) => row.action === 'return.sealed')).toBe(true)
    const comparisonId = (await inShop(database, { role: 'hold_app', shopId: shop.shopId }, (transaction) => rentalReturns(transaction, rental.rentalId)))[0]?.comparisonId ?? ''
    expect(await returns.recordReview(null, form({ comparisonId, outcome: 'deferred', reason: 'Please inspect the item at the counter.', locale: 'en' }))).toMatchObject({ ok: true })
    const report = await inShop(database, { role: 'hold_app', shopId: shop.shopId }, (transaction) => comparisonReport(transaction, comparisonId))
    expect(report?.reviews[0]?.detail).toEqual({ outcome: 'deferred', reason: 'Please inspect the item at the counter.' })
    await signIn(jar, 'reader@return-flow.example', 'email_code')
    expect(await returns.recordReview(null, form({ comparisonId, outcome: 'clean', reason: 'Override', locale: 'en' }))).toEqual({ ok: false, failure: 'role' })
  })
  // The test environment's model is the simulated stand-in (audit F-M5): code finds the chip on the sample with damage,
  // the stand-in words it as a finding over that area and prices nothing, and staff choose the agreed price to claim it.
  it('finds the change code saw on a damaged return, and lets staff claim it at the agreed price they choose', async () => {
    const rental = await handedOver(true)
    const begun = await returns.startReturn(null, form({ rentalId: rental.rentalId, itemId: rental.itemId, locale: 'en' }))
    if (!begun.ok) throw new Error(JSON.stringify(begun))
    await photographed(begun.value.sessionId, 'return')
    expect(await returns.sealReturn(null, form({ sessionId: begun.value.sessionId, locale: 'en' }))).toMatchObject({ ok: true })
    const { database } = await getServices()
    const scoped = <Result>(work: Parameters<typeof inShop<Result>>[2]) => inShop(database, { role: 'hold_app', shopId: shop.shopId }, work)
    const comparisonId = (await scoped((transaction) => rentalReturns(transaction, rental.rentalId)))[0]?.comparisonId ?? ''
    const report = await scoped((transaction) => comparisonReport(transaction, comparisonId))
    expect(report).toMatchObject({ state: 'findings', model: 'simulated', simulated: true, modelAnswered: false })
    expect(report?.findings.length).toBeGreaterThan(0)
    expect(report?.findings.every((finding) => finding.class === 'new_damage' && finding.secondLookConfirmed === true && finding.amountCents === null)).toBe(true)
    const workspace = await scoped((transaction) => claimWorkspace(transaction, rental.rentalId))
    const [finding] = workspace?.possibleFindings ?? []
    expect(finding).toMatchObject({ suggestedPriceEntryId: null, simulated: true })
    const lines = JSON.stringify([{ priceEntryId: workspace?.prices[0]?.id ?? '', findingId: finding?.id ?? '' }])
    expect(await claims.prepareClaim(null, form({ rentalId: rental.rentalId, lines, locale: 'en' }))).toMatchObject({ ok: true })
  })
  it('refuses a handover passed to a return action and a return passed to a handover action', async () => {
    const rental = await handedOver()
    expect(await returns.sealReturn(null, form({ sessionId: rental.handoverId, locale: 'en' }))).toMatchObject({ ok: false, reason: 'not_found' })
    const begun = await returns.startReturn(null, form({ rentalId: rental.rentalId, itemId: rental.itemId, locale: 'en' }))
    if (!begun.ok) throw new Error(JSON.stringify(begun))
    expect(await handover.sealHandover(null, form({ sessionId: begun.value.sessionId, locale: 'en' }))).toMatchObject({ ok: false, reason: 'not_found' })
  })
  it('rejects read-only staff, unknown fields and requests without authentication', async () => {
    const rental = await handedOver()
    const fields = { rentalId: rental.rentalId, itemId: rental.itemId, locale: 'en' }
    expect(await returns.startReturn(null, form({ ...fields, amount: '999' }))).toMatchObject({ ok: false, failure: 'invalid' })
    await signIn(jar, 'reader@return-flow.example', 'email_code')
    expect(await returns.startReturn(null, form(fields))).toEqual({ ok: false, failure: 'role' })
    jar.clear()
    expect(await returns.startReturn(null, form(fields))).toEqual({ ok: false, failure: 'signed_out' })
  })
  it('finds no rental in another shop, even with a valid item id', async () => {
    const rental = await handedOver()
    await handoverShop(jar, 'owner@other-return.example', 'Other Return Bikes')
    expect(await returns.startReturn(null, form({ rentalId: rental.rentalId, itemId: rental.itemId, locale: 'en' }))).toMatchObject({ ok: false, reason: 'not_found' })
  })
})
