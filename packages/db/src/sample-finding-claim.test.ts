import { SAMPLE_PHOTO_SHA256 } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { captureSession, recordPhoto, sealSession, startCaptureSession } from './capture-repository.ts'
import { claimWorkspace } from './claim-query.ts'
import { draftClaim } from './claim-repository.ts'
import { beginComparison, completeComparison } from './comparison-repository.ts'
import { claimLines, comparisons, paypalAccounts, priceEntries } from './schema/index.ts'
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

// A returned rental whose handover and return were both photographed with samples, and whose comparison found
// independently confirmed new damage priced from the agreed list.
async function returnedFromSamples(shop: ReadyRentalShop) {
  const rental = await shop.readyRental()
  for (const kind of ['handover', 'return'] as const) {
    const opened = await shop.act((transaction) => startCaptureSession(transaction, { rentalId: rental.rentalId, rentalItemId: rental.rentalItemIds[0] ?? '', kind, actorUserId: shop.scope.userId ?? null }, now))
    if (!opened.ok) throw new Error(opened.reason)
    const session = await shop.act((transaction) => captureSession(transaction, opened.sessionId))
    for (const view of session?.plan.filter((each) => each.required) ?? []) await shop.act((transaction) => recordPhoto(transaction, opened.sessionId, { view: view.key, evidenceKey: `${opened.sessionId}/${view.key}`, sha256: kind === 'handover' ? SAMPLE_PHOTO_SHA256.handover : SAMPLE_PHOTO_SHA256.damage, quality: { sharpness: 120, shadows: 20, highlights: 220, filled: 0.6 } }, now))
    await shop.act((transaction) => sealSession(transaction, opened.sessionId, now))
  }
  const [comparison] = await shop.act((transaction) => transaction.select().from(comparisons).where(eq(comparisons.state, 'pending')))
  if (comparison === undefined) throw new Error('No comparison')
  const lease = await shop.act((transaction) => beginComparison(transaction, comparison.id, now))
  if (lease === undefined) throw new Error('No lease')
  const [price] = await shop.act((transaction) => transaction.select().from(priceEntries))
  const finding = { view: lease.plan[0]?.key ?? 'left-side', region: { x: 0.3, y: 0.4, width: 0.1, height: 0.1 }, class: 'new_damage' as const, confidence: 0.95, description: 'A chip in the paint on the down tube.', secondLookConfirmed: true, matchedMarkId: null, suggestedPriceEntryId: price?.id ?? null }
  await shop.act((transaction) => completeComparison(transaction, comparison.id, lease.startedAt, { state: 'findings', model: 'test-model', promptVersion: 'test-v1', alignment: {}, reason: null, simulated: true, findings: [finding] }, now))
  const findingId = await shop.act(async (transaction) => (await transaction.query.findings.findFirst({ where: (each, { eq: equal }) => equal(each.comparisonId, comparison.id) }))?.id ?? '')
  return { rentalId: rental.rentalId, findingId, priceEntryId: price?.id ?? '' }
}

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
