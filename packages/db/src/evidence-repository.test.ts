import { afterAll, beforeAll, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import * as repository from './index.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'

const now = new Date('2026-10-20T10:00:00Z')
let database: TestDatabase
let shop: ReadyRentalShop
let other: ReadyRentalShop
beforeAll(async () => {
  database = await createTestDatabase()
  shop = await readyRentalShop(database, 'record', now)
  other = await readyRentalShop(database, 'other-record', now)
})
afterAll(async () => { await database.$client.close() })

it('freezes the agreed prices, reuses unchanged source and preserves earlier versions after a change', async () => {
  const rental = await shop.readyRental()
  const first = await shop.act((transaction) => repository.reserveEvidencePack(transaction, rental.rentalId, now))
  expect(first).toMatchObject({ version: 1, state: 'building', snapshot: { agreement: { prices: [{ description: 'Scratch', amountCents: 3500 }], wearRules: 'Scuffs are wear.' } } })
  const repeated = await shop.act((transaction) => repository.reserveEvidencePack(transaction, rental.rentalId, new Date('2026-10-21')))
  expect(repeated?.id).toBe(first?.id)
  await shop.act((transaction) => transaction.update(repository.rentals).set({ conditionReply: 'confirmed', conditionRepliedAt: now }).where(eq(repository.rentals.id, rental.rentalId)))
  const next = await shop.act((transaction) => repository.reserveEvidencePack(transaction, rental.rentalId, now))
  expect(next).toMatchObject({ version: 2 })
  expect((await shop.act((transaction) => repository.evidencePackFor(transaction, rental.rentalId, first?.id ?? '')))?.snapshot.rental.conditionReply).toBeNull()
  expect(await other.act((transaction) => repository.evidencePackFor(transaction, rental.rentalId, first?.id ?? ''))).toBeUndefined()
  expect(await other.act((transaction) => repository.reserveEvidencePack(transaction, rental.rentalId, now))).toBeUndefined()
})

it('publishes once through the worker and refuses rewriting or deleting published evidence', async () => {
  const rental = await shop.readyRental()
  const pack = await shop.act((transaction) => repository.reserveEvidencePack(transaction, rental.rentalId, now))
  if (pack === undefined) throw new Error('Missing pack')
  const artifacts = { pdfSha256: 'a'.repeat(64), manifestSha256: 'b'.repeat(64), pdfVersionId: 'pdf-v1', manifestVersionId: 'manifest-v1', snapshotVersionId: 'snapshot-v1' }
  const worker = <Result>(work: (transaction: repository.Transaction) => Promise<Result>) => repository.inShop(database, { role: 'hold_worker', shopId: shop.scope.shopId }, work)
  await expect(shop.act((transaction) => repository.publishEvidencePack(transaction, pack.id, artifacts))).rejects.toThrow()
  expect(await worker((transaction) => repository.publishEvidencePack(transaction, pack.id, artifacts))).toBe(true)
  const published = await shop.act((transaction) => repository.evidencePackFor(transaction, rental.rentalId, pack.id))
  expect(published).toMatchObject({ state: 'ready', pdfVersionId: 'pdf-v1' })
  await expect(worker((transaction) => transaction.update(repository.evidencePacks).set({ pdfSha256: 'c'.repeat(64) }).where(eq(repository.evidencePacks.id, pack.id)))).rejects.toThrow()
  await expect(worker((transaction) => transaction.delete(repository.evidencePacks).where(eq(repository.evidencePacks.id, pack.id)))).rejects.toThrow()
  await expect(shop.act((transaction) => transaction.update(repository.evidencePacks).set({ snapshot: pack.snapshot }).where(eq(repository.evidencePacks.id, pack.id)))).rejects.toThrow()
})

it('refuses a ready version with missing hashes or object versions at the database boundary', async () => {
  const rental = await shop.readyRental()
  const pack = await shop.act((transaction) => repository.reserveEvidencePack(transaction, rental.rentalId, now))
  if (pack === undefined) throw new Error('Missing pack')
  await expect(repository.inShop(database, { role: 'hold_worker', shopId: shop.scope.shopId }, (transaction) => transaction.update(repository.evidencePacks).set({ state: 'ready', manifestFingerprint: 'b'.repeat(64), pdfVersionId: 'p', manifestVersionId: 'm', snapshotVersionId: 's' }).where(eq(repository.evidencePacks.id, pack.id)))).rejects.toThrow()
})

it('never lets the web service insert a document already marked published', async () => {
  const rental = await shop.readyRental()
  const pack = await shop.act((transaction) => repository.reserveEvidencePack(transaction, rental.rentalId, now))
  if (pack === undefined) throw new Error('Missing pack')
  await expect(shop.act((transaction) => transaction.insert(repository.evidencePacks).values({ shopId: shop.scope.shopId, rentalId: rental.rentalId, version: 2, snapshot: pack.snapshot, sourceFingerprint: 'c'.repeat(64), state: 'ready', evidenceKey: `packs/${shop.scope.shopId}/${rental.rentalId}/2/record.pdf`, manifestFingerprint: 'b'.repeat(64), pdfSha256: 'a'.repeat(64), pdfVersionId: 'p', manifestVersionId: 'm', snapshotVersionId: 's' }))).rejects.toThrow()
})

// A dispute is answered with the rental's latest published record (extensions.md section 6.3, step 6).
it('finds the latest published evidence pack of a rental, for a dispute answer, and nothing before one is published', async () => {
  const rental = await shop.readyRental()
  const worker = <Result>(work: (transaction: repository.Transaction) => Promise<Result>) => repository.inShop(database, { role: 'hold_worker', shopId: shop.scope.shopId }, work)
  const pack = await shop.act((transaction) => repository.reserveEvidencePack(transaction, rental.rentalId, now))
  if (pack === undefined) throw new Error('Missing pack')
  expect(await worker((transaction) => repository.publishedEvidencePack(transaction, rental.rentalId))).toBeUndefined()

  await worker((transaction) => repository.publishEvidencePack(transaction, pack.id, { pdfSha256: 'c'.repeat(64), manifestSha256: 'd'.repeat(64), pdfVersionId: 'pdf-v9', manifestVersionId: 'm-v9', snapshotVersionId: 's-v9' }))

  expect(await worker((transaction) => repository.publishedEvidencePack(transaction, rental.rentalId))).toEqual({ evidenceKey: pack.evidenceKey, pdfVersionId: 'pdf-v9', version: pack.version })
})
