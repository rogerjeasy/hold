import { createHash, randomUUID } from 'node:crypto'
import { captureSession, evidencePackFor, recordPhoto, rentals, reserveEvidencePack, sealSession, startCaptureSession } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import type { TestDatabase } from '@hold/db/testing'
import { readyRentalShop } from '@hold/db/testing/ready-rental'
import type { ReadyRentalShop } from '@hold/db/testing/ready-rental'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as evidence from './index.ts'
import type { DocumentStore } from './document-port.ts'

const NOW = new Date('2026-10-20T10:00:00Z')
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
let database: TestDatabase
let shop: ReadyRentalShop
let other: ReadyRentalShop

beforeAll(async () => {
  database = await createTestDatabase()
  shop = await readyRentalShop(database, 'pack-job', NOW)
  other = await readyRentalShop(database, 'other-pack-job', NOW)
})
afterAll(async () => { await database.$client.close() })

async function reserved(withPhotos = false) {
  const rental = await shop.readyRental()
  const store = evidence.createMemoryEvidenceStore({ baseUrl: 'https://hold.test' })
  const display = await sharp({ create: { width: 160, height: 120, channels: 3, background: '#aac' } }).jpeg().toBuffer()
  if (withPhotos) {
    const started = await shop.act((transaction) => startCaptureSession(transaction, { rentalId: rental.rentalId, rentalItemId: rental.rentalItemIds[0] ?? '', kind: 'handover', actorUserId: null }, NOW))
    if (!started.ok) throw new Error(started.reason)
    const session = await shop.act((transaction) => captureSession(transaction, started.sessionId))
    for (const view of session?.plan.filter((view) => view.required) ?? []) {
      const key = `${shop.scope.shopId}/${started.sessionId}/${view.key}.jpg`
      store.receive(key, Buffer.from('private original'), createHash('sha256').update('private original').digest('base64'))
      const result = await shop.act((transaction) => recordPhoto(transaction, started.sessionId, { view: view.key, evidenceKey: key, sha256: 'a'.repeat(64), quality: { sharpness: 120, shadows: 20, highlights: 220, filled: 0.6 } }, NOW))
      if (!result.ok) throw new Error(result.reason)
    }
    const sealed = await shop.act((transaction) => sealSession(transaction, started.sessionId, NOW))
    if (!sealed.ok) throw new Error(sealed.reason)
  }
  const pack = await shop.act((transaction) => reserveEvidencePack(transaction, rental.rentalId, NOW))
  if (pack === undefined) throw new Error('Missing reserved evidence pack')
  const message = { shopId: shop.scope.shopId, packId: pack.id }
  const current = () => shop.act((transaction) => evidencePackFor(transaction, rental.rentalId, pack.id))
  return { pack, store, message, current, display }
}

describe('building frozen evidence packs', () => {
  it('publishes pinned PDF, manifest and source versions from the frozen record', async () => {
    expect(evidence).toHaveProperty('makeEvidencePack')
    const fixture = await reserved()
    const documents = evidence.createMemoryDocumentStore()
    await shop.act((transaction) => transaction.update(rentals).set({ conditionReply: 'confirmed', conditionRepliedAt: NOW }).where(eq(rentals.id, fixture.pack.rentalId)))
    expect(await evidence.makeEvidencePack({ database, evidence: fixture.store, documents }, fixture.message)).toBe('made')
    const pack = await fixture.current()
    expect(pack).toMatchObject({ state: 'ready', version: 1, lastError: null })
    const pdf = await documents.read(fixture.pack.evidenceKey, pack?.pdfVersionId ?? '')
    const manifest = await documents.read(fixture.pack.evidenceKey.replace('record.pdf', 'manifest.json'), pack?.manifestVersionId ?? '')
    const source = await documents.read(fixture.pack.evidenceKey.replace('record.pdf', 'snapshot.json'), pack?.snapshotVersionId ?? '')
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(hash(pdf)).toBe(pack?.pdfSha256)
    expect(hash(manifest)).toBe(pack?.manifestFingerprint)
    expect(hash(source)).toBe(fixture.pack.sourceFingerprint)
    expect(JSON.parse(source.toString())).toMatchObject({ rental: { conditionReply: null } })
    expect(JSON.parse(manifest.toString())).toMatchObject({ rentalId: fixture.pack.rentalId })
    const forbidden: DocumentStore = { ...documents, put: () => Promise.reject(new Error('Duplicate must not write a new version')) }
    expect(await evidence.makeEvidencePack({ database, evidence: fixture.store, documents: forbidden }, fixture.message)).toBe('nothing_to_do')
    expect(await fixture.current()).toEqual(pack)
  })

  it('ignores missing packs and packs belonging to another shop', async () => {
    const fixture = await reserved()
    const documents = evidence.createMemoryDocumentStore()
    expect(await evidence.makeEvidencePack({ database, evidence: fixture.store, documents }, { ...fixture.message, shopId: other.scope.shopId })).toBe('nothing_to_do')
    expect(await evidence.makeEvidencePack({ database, evidence: fixture.store, documents }, { ...fixture.message, packId: randomUUID() })).toBe('nothing_to_do')
    expect(await fixture.current()).toMatchObject({ state: 'building', pdfVersionId: null })
    await expect(documents.read(fixture.pack.evidenceKey, '')).rejects.toThrow('Document version missing')
  })

  it('refuses original-only photographs and retries the same version after display copies arrive', async () => {
    const fixture = await reserved(true)
    const documents = evidence.createMemoryDocumentStore()
    await expect(evidence.makeEvidencePack({ database, evidence: fixture.store, documents }, fixture.message)).rejects.toMatchObject({ name: 'EvidenceBuildError', code: 'display_pending' })
    expect(await fixture.current()).toMatchObject({ state: 'failed', lastError: 'display_pending', pdfVersionId: null })
    await expect(documents.read(fixture.pack.evidenceKey, '')).rejects.toThrow('Document version missing')
    for (const item of fixture.pack.snapshot.items) for (const session of item.sessions) for (const photo of session.photos) await fixture.store.putDisplay(photo.displayKey, fixture.display)
    expect(await evidence.makeEvidencePack({ database, evidence: fixture.store, documents }, fixture.message)).toBe('made')
    const pack = await fixture.current()
    expect(pack).toMatchObject({ state: 'ready', version: fixture.pack.version, lastError: null })
    const manifest = await documents.read(fixture.pack.evidenceKey.replace('record.pdf', 'manifest.json'), pack?.manifestVersionId ?? '')
    expect(manifest.toString()).toContain(hash(fixture.display))
    expect(manifest.toString()).not.toContain(fixture.pack.snapshot.items[0]?.sessions[0]?.photos[0]?.displayKey)
  })

  it.each(['snapshot.json', 'manifest.json', 'record.pdf'])('recovers identical bytes after storage accepts %s but loses its response', async (lostArtifact) => {
    const fixture = await reserved()
    const documents = evidence.createMemoryDocumentStore()
    const savedArtifacts = new Map<string, { bytes: Buffer; versionId: string }>()
    let failed = false
    const transport: DocumentStore = { ...documents, async put(key, bytes, type) {
      const result = await documents.put(key, bytes, type)
      if (!failed) savedArtifacts.set(key, { bytes: Buffer.from(bytes), versionId: result.versionId })
      if (key.endsWith(lostArtifact) && !failed) {
        failed = true
        throw new Error('secret transport diagnostic must not be retained')
      }
      return result
    } }
    await expect(evidence.makeEvidencePack({ database, evidence: fixture.store, documents: transport }, fixture.message)).rejects.toMatchObject({ name: 'EvidenceBuildError', code: 'artifact_failed', message: 'artifact_failed' })
    expect(await fixture.current()).toMatchObject({ state: 'failed', lastError: 'artifact_failed' })
    expect(await evidence.makeEvidencePack({ database, evidence: fixture.store, documents: transport }, fixture.message)).toBe('made')
    const pack = await fixture.current()
    expect(pack).toMatchObject({ id: fixture.pack.id, state: 'ready', version: fixture.pack.version })
    for (const [key, saved] of savedArtifacts) expect(await documents.read(key, saved.versionId)).toEqual(saved.bytes)
    const pdf = await documents.read(fixture.pack.evidenceKey, pack?.pdfVersionId ?? '')
    expect(hash(pdf)).toBe(pack?.pdfSha256)
  })

  it('publishes one immutable version when two workers build concurrently', async () => {
    const fixture = await reserved()
    const documents = evidence.createMemoryDocumentStore()
    const result = await Promise.all([
      evidence.makeEvidencePack({ database, evidence: fixture.store, documents }, fixture.message),
      evidence.makeEvidencePack({ database, evidence: fixture.store, documents }, fixture.message),
    ])
    expect(result.sort()).toEqual(['made', 'nothing_to_do'])
    expect(await fixture.current()).toMatchObject({ state: 'ready', version: fixture.pack.version })
  })

  it('refuses publication when storage confirms a different document checksum', async () => {
    const fixture = await reserved()
    const documents = evidence.createMemoryDocumentStore()
    const corrupt: DocumentStore = { ...documents, async put(key, bytes, type) {
      const stored = await documents.put(key, bytes, type)
      return type === 'application/pdf' ? { ...stored, sha256: '0'.repeat(64) } : stored
    } }
    await expect(evidence.makeEvidencePack({ database, evidence: fixture.store, documents: corrupt }, fixture.message)).rejects.toMatchObject({ code: 'artifact_failed' })
    expect(await fixture.current()).toMatchObject({ state: 'failed', lastError: 'artifact_failed', pdfSha256: null })
  })

  it('rejects unknown queue fields and malformed rental identities', () => {
    expect(evidence).toHaveProperty('evidenceMessageSchema')
    const message = { shopId: randomUUID(), packId: randomUUID() }
    expect(evidence.evidenceMessageSchema.safeParse(message).success).toBe(true)
    expect(evidence.evidenceMessageSchema.safeParse({ ...message, amount: 100 }).success).toBe(false)
    expect(evidence.evidenceMessageSchema.safeParse({ ...message, packId: 'invalid' }).success).toBe(false)
  })
})
