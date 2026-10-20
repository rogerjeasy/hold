import { afterAll, beforeAll, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import * as repository from './index.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'
const now = new Date('2026-10-20T11:00:00Z')
let database: TestDatabase
let shop: ReadyRentalShop
beforeAll(async () => { database = await createTestDatabase(); shop = await readyRentalShop(database, 'receipt', now) })
afterAll(async () => { await database.$client.close() })

it('requires verified money events, groups capture with its remainder and binds one delivery to a frozen version', async () => {
  const rental = await shop.readyRental()
  expect(await shop.act((transaction) => repository.queueSettlementReceipts(transaction, rental.rentalId, now, ['CAP-VERIFIED', 'AUTH:remainder', 'REF-VERIFIED']))).toEqual([])
  await shop.act((transaction) => transaction.insert(repository.moneyEvents).values([
    { shopId: shop.scope.shopId, rentalId: rental.rentalId, kind: 'hold_captured', amountCents: 3500, currency: 'EUR', paypalReference: 'CAP-VERIFIED', occurredAt: now },
    { shopId: shop.scope.shopId, rentalId: rental.rentalId, kind: 'hold_released', amountCents: 26500, currency: 'EUR', paypalReference: 'AUTH:remainder', occurredAt: now },
  ]))
  const first = await shop.act((transaction) => repository.queueSettlementReceipts(transaction, rental.rentalId, now, ['CAP-VERIFIED', 'AUTH:remainder', 'REF-VERIFIED']))
  expect(first).toHaveLength(1)
  expect(await shop.act((transaction) => repository.queueSettlementReceipts(transaction, rental.rentalId, now, ['CAP-VERIFIED', 'AUTH:remainder', 'REF-VERIFIED']))).toEqual([])
  const receipts = await shop.act((transaction) => repository.receiptDeliveriesFor(transaction, rental.rentalId))
  expect(receipts).toMatchObject([{ id: first[0], kind: 'capture', status: 'queued', amountCents: 3500, releasedCents: 26500 }])
  const packId = receipts[0]?.packId ?? ''
  const pack = await shop.act((transaction) => repository.evidencePackFor(transaction, rental.rentalId, packId))
  expect(pack?.snapshot.payments.filter((payment) => payment.kind === 'hold_captured')).toMatchObject([{ paypalReference: 'CAP-VERIFIED' }])
  expect((await shop.act((transaction) => transaction.select().from(repository.outbox).where(eq(repository.outbox.queue, 'messages'))))).toHaveLength(0)
})

it('fences concurrent deliveries and only leases receipts whose exact pack has been published', async () => {
  const rental = await shop.readyRental()
  await shop.act((transaction) => transaction.insert(repository.moneyEvents).values({ shopId: shop.scope.shopId, rentalId: rental.rentalId, kind: 'refunded', amountCents: 3500, currency: 'EUR', paypalReference: 'REF-VERIFIED', occurredAt: now }))
  const [id] = await shop.act((transaction) => repository.queueSettlementReceipts(transaction, rental.rentalId, now, ['CAP-VERIFIED', 'AUTH:remainder', 'REF-VERIFIED']))
  if (id === undefined) throw new Error('No receipt')
  const worker = <Result>(work: (transaction: repository.Transaction) => Promise<Result>) => repository.inShop(database, { role: 'hold_worker', shopId: shop.scope.shopId }, work)
  expect(await worker((transaction) => repository.leaseReceipt(transaction, id, 'first', now))).toBeUndefined()
  const receipt = (await shop.act((transaction) => repository.receiptDeliveriesFor(transaction, rental.rentalId)))[0]
  if (receipt === undefined) throw new Error('No receipt')
  await worker((transaction) => repository.publishEvidencePack(transaction, receipt.packId, { pdfSha256: 'a'.repeat(64), manifestSha256: 'b'.repeat(64), pdfVersionId: 'p', manifestVersionId: 'm', snapshotVersionId: 's' }))
  expect(await worker((transaction) => repository.leaseReceipt(transaction, id, 'first', now))).toMatchObject({ status: 'sending', attempts: 1 })
  expect(await worker((transaction) => repository.leaseReceipt(transaction, id, 'second', now))).toBeUndefined()
  expect(await worker((transaction) => repository.finishReceipt(transaction, id, 'second', true, now))).toBe(false)
  expect(await worker((transaction) => repository.finishReceipt(transaction, id, 'first', true, now))).toBe(true)
  expect(await worker((transaction) => repository.leaseReceipt(transaction, id, 'third', new Date(now.getTime() + 600000)))).toBeUndefined()
  await expect(shop.act((transaction) => transaction.update(repository.receiptDeliveries).set({ status: 'sent' }))).rejects.toThrow()
})

it('refuses a web-service insert that pretends a receipt has already been sent', async () => {
  const rental = await shop.readyRental()
  const pack = await shop.act((transaction) => repository.reserveEvidencePack(transaction, rental.rentalId, now))
  const [event] = await shop.act((transaction) => transaction.insert(repository.moneyEvents).values({ shopId: shop.scope.shopId, rentalId: rental.rentalId, kind: 'refunded', currency: 'EUR', amountCents: 3500, paypalReference: 'FORGED-SENT', occurredAt: now }).returning())
  if (pack === undefined || event === undefined) throw new Error('Missing record')
  await expect(shop.act((transaction) => transaction.insert(repository.receiptDeliveries).values({ shopId: shop.scope.shopId, rentalId: rental.rentalId, packId: pack.id, eventId: event.id, language: 'en', kind: 'refund', currency: 'EUR', amountCents: 3500, releasedCents: 0, paypalReference: event.paypalReference, status: 'sent', sentAt: now }))).rejects.toThrow()
})
