import { afterAll, beforeAll, expect, it } from 'vitest'
import { createTestDatabase } from '@hold/db/testing'
import { readyRentalShop } from '@hold/db/testing/ready-rental'
import { evidencePackFor, findRenterLink, moneyEvents, queueSettlementReceipts, receiptDeliveriesFor, rentals } from '@hold/db'
import { readRenterToken, renterLinkKey } from '@hold/auth'
import { createMemoryDocumentStore, createMemoryEvidenceStore, makeEvidencePack } from '@hold/evidence'
import { createMemoryMailer } from '@hold/notify'

const now = new Date('2026-10-20T13:00:00Z')
let database: Awaited<ReturnType<typeof createTestDatabase>>
let shop: Awaited<ReturnType<typeof readyRentalShop>>
const key = Buffer.alloc(32, 17)
beforeAll(async () => { database = await createTestDatabase(); shop = await readyRentalShop(database, 'receipt-worker', now) })
afterAll(async () => { await database.$client.close() })
async function prepared(reference: string, withoutContact = false) {
  const rental = await shop.readyRental()
  await shop.act(async (transaction) => {
    if (withoutContact) await transaction.update(rentals).set({ renterId: null })
    await transaction.insert(moneyEvents).values({ shopId: shop.scope.shopId, rentalId: rental.rentalId, kind: 'refunded', amountCents: 3500, currency: 'EUR', paypalReference: reference, occurredAt: now })
  })
  const [receiptId] = await shop.act((transaction) => queueSettlementReceipts(transaction, rental.rentalId, now, [reference]))
  const [receipt] = await shop.act((transaction) => receiptDeliveriesFor(transaction, rental.rentalId))
  if (receiptId === undefined || receipt === undefined) throw new Error('Missing receipt')
  await makeEvidencePack({ database, documents: createMemoryDocumentStore(), evidence: createMemoryEvidenceStore({ baseUrl: 'https://hold.test' }) }, { shopId: shop.scope.shopId, packId: receipt.packId })
  return { ...rental, receiptId, packId: receipt.packId }
}
it('sends one confirmed receipt with a read-only signed link to its exact immutable version', async () => {
  const { sendSettlementReceipt } = await import('./settlement-receipt.ts')
  const rental = await prepared('REF-VERIFIED-WORKER')
  const mailer = createMemoryMailer()
  const options = { database, mailer, publicUrl: 'https://hold.test', linkKey: () => Promise.resolve(key), now: () => now }
  const message = { shopId: shop.scope.shopId, receiptId: rental.receiptId }
  expect(await sendSettlementReceipt(options, message)).toBe('sent')
  expect(await sendSettlementReceipt(options, message)).toBe('nothing_to_do')
  expect(mailer.sent).toHaveLength(1)
  expect(mailer.sent[0]?.text).toContain('REF-VERIFIED-WORKER')
  expect(mailer.sent[0]?.text).toContain(`version=${rental.packId}`)
  const token = /\/r\/([A-Za-z0-9_-]+)\/record/.exec(mailer.sent[0]?.text ?? '')?.[1] ?? ''
  const fingerprint = readRenterToken(renterLinkKey(key), token)?.fingerprint ?? ''
  expect(await findRenterLink(database, fingerprint)).toMatchObject({ rentalId: rental.rentalId, scopes: ['view'] })
  const pack = await shop.act((transaction) => evidencePackFor(transaction, rental.rentalId, rental.packId))
  expect(JSON.stringify(pack)).not.toContain(token)
})
it('retries a refused transport without rebuilding or changing the document version', async () => {
  const { sendSettlementReceipt } = await import('./settlement-receipt.ts')
  const rental = await prepared('REF-RETRY-WORKER')
  const options = { database, publicUrl: 'https://hold.test', linkKey: () => Promise.resolve(key), now: () => now }
  await expect(sendSettlementReceipt({ ...options, mailer: { send: () => Promise.resolve(false) } }, { shopId: shop.scope.shopId, receiptId: rental.receiptId })).rejects.toThrow('email_unavailable')
  const failed = await shop.act((transaction) => receiptDeliveriesFor(transaction, rental.rentalId))
  expect(failed).toMatchObject([{ status: 'failed', packId: rental.packId }])
  const mailer = createMemoryMailer()
  expect(await sendSettlementReceipt({ ...options, mailer }, { shopId: shop.scope.shopId, receiptId: rental.receiptId })).toBe('sent')
  expect(mailer.sent[0]?.text).toContain(`version=${rental.packId}`)
  const outsider = await readyRentalShop(database, 'receipt-outsider', now)
  expect(await sendSettlementReceipt({ ...options, mailer }, { shopId: outsider.scope.shopId, receiptId: rental.receiptId })).toBe('nothing_to_do')
  expect(mailer.sent).toHaveLength(1)
})

it('records missing verified contact as a delivery failure without using the booking address', async () => {
  const { sendSettlementReceipt } = await import('./settlement-receipt.ts')
  const rental = await prepared('REF-CONTACT-MISSING', true)
  const mailer = createMemoryMailer()
  await expect(sendSettlementReceipt({ database, mailer, publicUrl: 'https://hold.test', linkKey: () => Promise.resolve(key), now: () => now }, { shopId: shop.scope.shopId, receiptId: rental.receiptId })).rejects.toThrow('contact_missing')
  expect(mailer.sent).toHaveLength(0)
  expect(await shop.act((transaction) => receiptDeliveriesFor(transaction, rental.rentalId))).toMatchObject([{ status: 'failed', packId: rental.packId }])
})
