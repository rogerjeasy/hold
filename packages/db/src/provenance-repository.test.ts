import { createHash } from 'node:crypto'
import { SAMPLE_PHOTO_SHA256 } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { recordDisplayCopy, recordPhoto, replyToCondition, sealSession, startCaptureSession } from './capture-repository.ts'
import { conditionConfirmation, evidenceStatementSource, photoProvenance } from './provenance-repository.ts'
import { photos } from './schema/index.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'

const NOW = new Date('2026-11-01T09:00:00Z')
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const QUALITY = { sharpness: 120, shadows: 20, highlights: 220, filled: 0.6 }

let database: TestDatabase
let shop: ReadyRentalShop
let other: ReadyRentalShop

beforeAll(async () => {
  database = await createTestDatabase()
  shop = await readyRentalShop(database, 'provenance', NOW)
  other = await readyRentalShop(database, 'other-provenance', NOW)
})

// One session of the given kind on the rental's first item, every required view photographed with a display copy,
// sealed at the given minute.
async function sealed(rental: { readonly rentalId: string; readonly rentalItemIds: readonly string[] }, kind: 'handover' | 'return' | 'condition', minute: number, sources: { readonly 'left-side'?: 'camera' | 'file'; readonly 'right-side'?: 'camera' | 'file' } = {}) {
  const actorUserId = kind === 'condition' ? null : (shop.scope.userId ?? null)
  const started = await shop.act((transaction) => startCaptureSession(transaction, { rentalId: rental.rentalId, rentalItemId: rental.rentalItemIds[0] ?? '', kind, actorUserId }, later(minute)))
  if (!started.ok) throw new Error(started.reason)
  const views = kind === 'condition' ? (['missed-1'] as const) : (['left-side', 'right-side'] as const)
  for (const view of views) {
    const recorded = await shop.act((transaction) => recordPhoto(transaction, started.sessionId, { view, evidenceKey: `evidence/${started.sessionId}/${view}.jpg`, sha256: sha(`${started.sessionId}-${view}`), quality: QUALITY, source: view === 'missed-1' ? 'camera' : sources[view] }, later(minute)))
    if (!recorded.ok) throw new Error(recorded.reason)
    await shop.act((transaction) => recordDisplayCopy(transaction, recorded.photoId, `display/${started.sessionId}/${view}.jpg`, '0000000000000000'))
  }
  const done = await shop.act((transaction) => sealSession(transaction, started.sessionId, later(minute + 1)))
  if (!done.ok) throw new Error(done.reason)
  return { sessionId: started.sessionId, fingerprint: done.manifestFingerprint }
}

describe('where each photograph came from', () => {
  it('keeps the source Hold’s capture screen reported, and calls a sample a sample', async () => {
    const rental = await shop.readyRental()
    const started = await shop.act((transaction) => startCaptureSession(transaction, { rentalId: rental.rentalId, rentalItemId: rental.rentalItemIds[0] ?? '', kind: 'handover', actorUserId: null }, NOW))
    if (!started.ok) throw new Error(started.reason)
    await shop.act((transaction) => recordPhoto(transaction, started.sessionId, { view: 'left-side', evidenceKey: 'evidence/camera.jpg', sha256: sha('camera'), quality: QUALITY, source: 'camera' }, NOW))
    await shop.act((transaction) => recordPhoto(transaction, started.sessionId, { view: 'right-side', evidenceKey: 'evidence/sample.jpg', sha256: SAMPLE_PHOTO_SHA256.handover, quality: QUALITY, source: 'camera' }, NOW))
    await shop.act((transaction) => recordPhoto(transaction, started.sessionId, { view: 'battery', evidenceKey: 'evidence/unsaid.jpg', sha256: sha('unsaid'), quality: QUALITY }, NOW))
    const rows = await database.select({ view: photos.view, source: photos.source }).from(photos).where(eq(photos.sessionId, started.sessionId))
    expect(rows.map((row) => [row.view, row.source]).sort()).toEqual([['battery', null], ['left-side', 'camera'], ['right-side', 'sample']])
  })
})

describe('provenance under each photograph', () => {
  it('says when the server received it, who took it, how, its fingerprint and when its session was sealed', async () => {
    const rental = await shop.readyRental()
    const { sessionId } = await sealed(rental, 'handover', 0, { 'left-side': 'camera', 'right-side': 'file' })
    const found = await shop.act((transaction) => photoProvenance(transaction, [`display/${sessionId}/left-side.jpg`, `display/${sessionId}/right-side.jpg`]))
    expect(found.get(`display/${sessionId}/left-side.jpg`)).toEqual({ takenAt: NOW, takenBy: 'owner', source: 'camera', sha256: sha(`${sessionId}-left-side`), sealedAt: later(1), itemId: rental.itemIds[0] })
    expect(found.get(`display/${sessionId}/right-side.jpg`)).toMatchObject({ source: 'file' })
  })

  it('names the renter for what the renter photographed', async () => {
    const rental = await shop.readyRental()
    await sealed(rental, 'handover', 0)
    const { sessionId } = await sealed(rental, 'condition', 5)
    const found = await shop.act((transaction) => photoProvenance(transaction, [`display/${sessionId}/missed-1.jpg`]))
    expect(found.get(`display/${sessionId}/missed-1.jpg`)).toMatchObject({ takenBy: 'renter', source: 'camera' })
  })

  it('finds nothing of another shop’s photographs', async () => {
    const rental = await shop.readyRental()
    const { sessionId } = await sealed(rental, 'handover', 0)
    const found = await other.act((transaction) => photoProvenance(transaction, [`display/${sessionId}/left-side.jpg`]))
    expect(found.size).toBe(0)
  })
})

describe('the renter’s own confirmation of the handover photographs', () => {
  it('is nothing until the renter answers, then the answer and its time', async () => {
    const rental = await shop.readyRental()
    await sealed(rental, 'handover', 0)
    expect(await shop.act((transaction) => conditionConfirmation(transaction, rental.rentalId))).toBeNull()
    await shop.act((transaction) => replyToCondition(transaction, rental.rentalId, { kind: 'confirmed' }, later(30)))
    expect(await shop.act((transaction) => conditionConfirmation(transaction, rental.rentalId))).toEqual({ reply: 'confirmed', at: later(30) })
  })
})

describe('what an evidence statement is signed from', () => {
  it('holds each sealed session of the item in this rental, in the order they were sealed, with its exact manifest', async () => {
    const rental = await shop.readyRental()
    const handover = await sealed(rental, 'handover', 0, { 'left-side': 'camera', 'right-side': 'camera' })
    await shop.act((transaction) => replyToCondition(transaction, rental.rentalId, { kind: 'confirmed' }, later(30)))
    const returned = await sealed(rental, 'return', 60, { 'left-side': 'camera', 'right-side': 'file' })
    const source = await shop.act((transaction) => evidenceStatementSource(transaction, rental.rentalId, rental.itemIds[0] ?? ''))
    expect(source).toMatchObject({ shopName: 'Shop provenance', timeZone: 'UTC', itemLabel: expect.stringContaining('City e-bike') as unknown, simulated: false, confirmed: { reply: 'confirmed', at: later(30) } })
    expect(source?.views).toMatchObject({ 'left-side': 'Left side', 'right-side': 'Right side' })
    expect(source?.sessions.map((session) => [session.kind, session.fingerprint, session.takenBy])).toEqual([['handover', handover.fingerprint, 'owner'], ['return', returned.fingerprint, 'owner']])
    expect(source?.sessions[1]?.sources).toEqual({ 'left-side': 'camera', 'right-side': 'file' })
    expect(sha(source?.sessions[1]?.manifest ?? '')).toBe(returned.fingerprint)
  })

  it('is nothing for an item not in the rental, or before anything is sealed', async () => {
    const rental = await shop.readyRental()
    expect(await shop.act((transaction) => evidenceStatementSource(transaction, rental.rentalId, rental.itemIds[0] ?? ''))).toBeUndefined()
    const elsewhere = await other.readyRental()
    expect(await shop.act((transaction) => evidenceStatementSource(transaction, rental.rentalId, elsewhere.itemIds[0] ?? ''))).toBeUndefined()
  })
})
