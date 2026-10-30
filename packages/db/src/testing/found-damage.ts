import { SAMPLE_PHOTO_SHA256 } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { captureSession, recordPhoto, sealSession, startCaptureSession } from '../capture-repository.ts'
import { beginComparison, completeComparison } from '../comparison-repository.ts'
import { comparisons, priceEntries } from '../schema/index.ts'
import type { ReadyRentalShop } from './ready-rental.ts'

// A returned rental whose handover and return were both photographed with samples, and whose comparison found
// independently confirmed new damage priced from the agreed list.
export async function returnedWithFinding(shop: ReadyRentalShop, now: Date) {
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
  return { rentalId: rental.rentalId, rentalItemId: rental.rentalItemIds[0] ?? '', itemId: rental.itemIds[0] ?? '', findingId, priceEntryId: price?.id ?? '' }
}
