import { SAMPLE_PHOTO_SHA256 } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { captureSession, recordDisplayCopy, recordPhoto, sealSession, startCaptureSession } from './capture-repository.ts'
import { approveClaim, draftClaim, presentClaim } from './claim-repository.ts'
import { beginComparison, completeComparison } from './comparison-repository.ts'
import { negotiationEvidence } from './negotiation-evidence.ts'
import { openAdvocate } from './negotiation-repository.ts'
import { comparisons, paypalAccounts, photos, priceEntries } from './schema/index.ts'
import { grantShopSettlement } from './settlement-mandate-repository.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

// What an advocate may read about a contested claim before it moves (extensions.md section 9.13): the lines with their
// findings and photographs, the price list and wear policy the renter agreed to, the marks known before the rental, and
// the condition report. Never either side's limits.
const now = new Date('2026-10-27T12:00:00Z')
let database: TestDatabase
let shop: ReadyRentalShop
let other: ReadyRentalShop

beforeAll(async () => {
  database = await createTestDatabase()
  shop = await readyRentalShop(database, 'evidence-advocate', now)
  other = await readyRentalShop(database, 'evidence-advocate-other', now)
  await database.insert(paypalAccounts).values({ shopId: shop.scope.shopId, credentialReference: 'hold/paypal/evidence-advocate', mode: 'sandbox' })
  await shop.act((transaction) => grantShopSettlement(transaction, shop.scope.userId ?? '', { lowestSharePercent: 50, largestClaimCents: 500_00, rounds: 6, evidenceRequired: true, finalTap: true }, 30, now))
})
afterAll(async () => { await database.$client.close() })

// A returned rental whose comparison found a chip, with display copies of its photographs, claimed and contested.
async function contestedFinding() {
  const rental = await shop.readyRental()
  for (const kind of ['handover', 'return'] as const) {
    const opened = await shop.act((transaction) => startCaptureSession(transaction, { rentalId: rental.rentalId, rentalItemId: rental.rentalItemIds[0] ?? '', kind, actorUserId: shop.scope.userId ?? null }, now))
    if (!opened.ok) throw new Error(opened.reason)
    const session = await shop.act((transaction) => captureSession(transaction, opened.sessionId))
    for (const view of session?.plan.filter((each) => each.required) ?? []) {
      const photo = await shop.act((transaction) => recordPhoto(transaction, opened.sessionId, { view: view.key, evidenceKey: `${opened.sessionId}/${view.key}`, sha256: kind === 'handover' ? SAMPLE_PHOTO_SHA256.handover : SAMPLE_PHOTO_SHA256.damage, quality: { sharpness: 120, shadows: 20, highlights: 220, filled: 0.6 } }, now))
      if (!photo.ok) throw new Error(photo.reason)
      await shop.act((transaction) => recordDisplayCopy(transaction, photo.photoId, `display/${kind}/${view.key}.jpg`, '0'.repeat(16)))
    }
    await shop.act((transaction) => sealSession(transaction, opened.sessionId, now))
  }
  const [comparison] = await shop.act((transaction) => transaction.select().from(comparisons).where(eq(comparisons.state, 'pending')))
  if (comparison === undefined) throw new Error('No comparison')
  const lease = await shop.act((transaction) => beginComparison(transaction, comparison.id, now))
  if (lease === undefined) throw new Error('No lease')
  const [price] = await shop.act((transaction) => transaction.select().from(priceEntries))
  const view = lease.plan[0]?.key ?? 'left-side'
  const finding = { view, region: { x: 0.3, y: 0.4, width: 0.1, height: 0.1 }, class: 'new_damage' as const, confidence: 0.95, description: 'A chip in the paint on the down tube.', secondLookConfirmed: true, matchedMarkId: null, suggestedPriceEntryId: price?.id ?? null }
  await shop.act((transaction) => completeComparison(transaction, comparison.id, lease.startedAt, { state: 'findings', model: 'test-model', promptVersion: 'test-v1', alignment: { [view]: 0.98 }, reason: null, simulated: true, findings: [finding] }, now))
  const findingId = await shop.act(async (transaction) => (await transaction.query.findings.findFirst({ where: (each, { eq: equal }) => equal(each.comparisonId, comparison.id) }))?.id ?? '')
  const owner = shop.scope.userId ?? ''
  const draft = await shop.act((transaction) => draftClaim(transaction, rental.rentalId, owner, [{ priceEntryId: price?.id ?? '', findingId }], now))
  if (!draft.ok) throw new Error(draft.reason)
  await shop.act((transaction) => approveClaim(transaction, draft.claimId, owner, now))
  await shop.act((transaction) => presentClaim(transaction, draft.claimId, owner, now))
  const opened = await shop.act((transaction) => openAdvocate(transaction, { rentalId: rental.rentalId, highestTotalCents: 31_23, comment: '', simulated: true }, now))
  if (!opened.ok) throw new Error(opened.reason)
  return { rentalId: rental.rentalId, negotiationId: opened.negotiationId, view }
}

describe('the evidence an advocate may read', () => {
  it('has each line’s finding and photographs, the agreed price list and wear policy, known marks and the condition report', async () => {
    const claim = await contestedFinding()
    const evidence = await shop.act((transaction) => negotiationEvidence(transaction, claim.negotiationId))
    expect(evidence).toMatchObject({
      currency: 'EUR',
      lines: [{ description: 'Scratch', publishedCents: 35_00, finding: { view: claim.view, findingClass: 'new_damage', confidence: 0.95, description: 'A chip in the paint on the down tube.', secondLookConfirmed: true, alignment: 0.98 }, photos: { view: claim.view, handoverKey: `display/handover/${claim.view}.jpg`, returnKey: `display/return/${claim.view}.jpg` } }],
      priceList: { version: 1, entries: [{ description: 'Scratch', category: 'damage', cents: 35_00 }] },
      wearPolicy: { version: 1, clauses: [{ id: 'wear-1', text: 'Scuffs are wear.' }] },
      knownMarks: [],
      conditionReport: { reply: null },
    })
    // The renter's highest total, 31.23, and the shop's limits are nowhere in it.
    expect(JSON.stringify(evidence)).not.toMatch(/3123|31\.23|highestTotal|lowestShare|largestClaim|50000/)
    expect(await other.act((transaction) => negotiationEvidence(transaction, claim.negotiationId))).toBeUndefined()
    expect(await other.act((transaction) => transaction.select().from(photos))).toEqual([])
  })
})
