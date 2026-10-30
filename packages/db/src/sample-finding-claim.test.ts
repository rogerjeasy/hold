import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { claimWorkspace } from './claim-query.ts'
import { draftClaim } from './claim-repository.ts'
import { claimLines, paypalAccounts } from './schema/index.ts'
import { returnedWithFinding } from './testing/found-damage.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

// A judge photographs the return with the demonstration's damaged sample (architecture.md section 20.3). In the PayPal
// sandbox the finding it gives may be billed, so the whole story reaches a real sandbox capture. In a live shop, or one
// with no PayPal account on record, a sample never bills.
const now = new Date('2026-10-27T12:00:00Z')
let database: TestDatabase
beforeAll(async () => { database = await createTestDatabase() })
afterAll(async () => { await database.$client.close() })

async function shopIn(subject: string, mode: 'sandbox' | 'live' | undefined) {
  const shop = await readyRentalShop(database, subject, now)
  if (mode !== undefined) await database.insert(paypalAccounts).values({ shopId: shop.scope.shopId, credentialReference: `hold/paypal/${subject}`, mode })
  return shop
}

const returnedFromSamples = (shop: ReadyRentalShop) => returnedWithFinding(shop, now)

describe('a finding from sample photographs', () => {
  it('may be billed in the PayPal sandbox, and the claim workspace offers it marked as a sample', async () => {
    const shop = await shopIn('sample-sandbox', 'sandbox')
    const returned = await returnedFromSamples(shop)
    const workspace = await shop.act((transaction) => claimWorkspace(transaction, returned.rentalId))
    expect(workspace?.possibleFindings).toEqual([expect.objectContaining({ id: returned.findingId, simulated: true })])
    const draft = await shop.act((transaction) => draftClaim(transaction, returned.rentalId, shop.scope.userId ?? '', [{ priceEntryId: returned.priceEntryId, findingId: returned.findingId }], now))
    expect(draft).toMatchObject({ ok: true })
    expect(await shop.act((transaction) => transaction.select().from(claimLines))).toEqual([expect.objectContaining({ source: 'finding', findingId: returned.findingId })])
  })

  it('never bills in a live shop, and the claim workspace does not offer it', async () => {
    const shop = await shopIn('sample-live', 'live')
    const returned = await returnedFromSamples(shop)
    expect((await shop.act((transaction) => claimWorkspace(transaction, returned.rentalId)))?.possibleFindings).toEqual([])
    expect(await shop.act((transaction) => draftClaim(transaction, returned.rentalId, shop.scope.userId ?? '', [{ priceEntryId: returned.priceEntryId, findingId: returned.findingId }], now))).toEqual({ ok: false, reason: 'finding_not_billable' })
  })

  it('never bills in a shop with no PayPal account on record, which counts as live', async () => {
    const shop = await shopIn('sample-unconnected', undefined)
    const returned = await returnedFromSamples(shop)
    expect((await shop.act((transaction) => claimWorkspace(transaction, returned.rentalId)))?.possibleFindings).toEqual([])
    expect(await shop.act((transaction) => draftClaim(transaction, returned.rentalId, shop.scope.userId ?? '', [{ priceEntryId: returned.priceEntryId, findingId: returned.findingId }], now))).toEqual({ ok: false, reason: 'finding_not_billable' })
  })
})
