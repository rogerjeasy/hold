import { createHash } from 'node:crypto'
import { inShop, photos, recordPhoto, startCaptureSession } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import type { TestDatabase } from '@hold/db/testing'
import { readyRentalShop } from '@hold/db/testing/ready-rental'
import type { ReadyRentalShop } from '@hold/db/testing/ready-rental'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'
import { makeDisplayCopy } from './display-job.ts'
import { createMemoryEvidenceStore } from './memory-store.ts'
import type { MemoryEvidenceStore } from './memory-store.ts'

const NOW = new Date('2026-10-16T09:00:00Z')
let database: TestDatabase
let shop: ReadyRentalShop
let store: MemoryEvidenceStore

// A photograph as the phone uploads it: large, with its metadata.
const original = () => sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#7a6' } }).withMetadata({ exif: { IFD0: { Copyright: 'phone' } } }).jpeg().toBuffer()

async function uploaded(): Promise<string> {
  const { rentalId, rentalItemIds } = await shop.readyRental()
  const started = await shop.act((transaction) => startCaptureSession(transaction, { rentalId, rentalItemId: rentalItemIds[0] ?? '', kind: 'handover', actorUserId: null }, NOW))
  if (!started.ok) throw new Error(started.reason)
  const body = await original()
  const key = `${shop.scope.shopId}/${started.sessionId}/left-side/1.jpg`
  const link = await store.uploadLink({ key, sha256: createHash('sha256').update(body).digest('hex'), bytes: body.length })
  store.receive(key, body, link.headers['x-amz-checksum-sha256'] ?? '')
  const recorded = await shop.act((transaction) => recordPhoto(transaction, started.sessionId, { view: 'left-side', evidenceKey: key, sha256: 'a'.repeat(64), quality: { sharpness: 100, shadows: 20, highlights: 220, filled: 0.5 } }, NOW))
  if (!recorded.ok) throw new Error(recorded.reason)
  return recorded.photoId
}

beforeAll(async () => {
  database = await createTestDatabase()
  shop = await readyRentalShop(database, 'display', NOW)
  store = createMemoryEvidenceStore({ baseUrl: 'https://hold.test' })
})

describe('making a photograph’s display copy', () => {
  it('stores a smaller copy without metadata, blurs the faces found on it, and records it with its fingerprint', async () => {
    const photoId = await uploaded()
    const asked: number[] = []
    const faces = {
      async find(image: Buffer) {
        asked.push((await sharp(image).metadata()).width)
        return [{ x: 0.1, y: 0.1, width: 0.2, height: 0.2 }]
      },
    }
    expect(await makeDisplayCopy({ database, role: 'hold_worker', evidence: store, faces }, { shopId: shop.scope.shopId, photoId })).toBe('made')
    // Rekognition takes images up to 5 MB, so it is asked about the smaller copy.
    expect(asked).toEqual([1600])
    const [row] = await inShop(database, { role: 'hold_worker', shopId: shop.scope.shopId }, (transaction) => transaction.select().from(photos).where(eq(photos.id, photoId)))
    expect(row?.perceptualHash).toMatch(/^[0-9a-f]{16}$/)
    const copy = store.displayed(row?.displayKey ?? '')
    if (copy === undefined) throw new Error('No display copy.')
    const info = await sharp(copy).metadata()
    expect([info.width, info.exif]).toEqual([1600, undefined])
  })

  it('makes a copy once, however often it is asked', async () => {
    const photoId = await uploaded()
    const job = { database, role: 'hold_worker' as const, evidence: store, faces: { find: () => Promise.resolve([]) } }
    expect(await makeDisplayCopy(job, { shopId: shop.scope.shopId, photoId })).toBe('made')
    expect(await makeDisplayCopy(job, { shopId: shop.scope.shopId, photoId })).toBe('nothing_to_do')
  })
})
