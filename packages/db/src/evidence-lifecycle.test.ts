import { afterAll, beforeAll, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { approveClaim, beginComparison, captureSession, comparisons, completeComparison, draftClaim, evidencePackFor, evidenceVersions, presentClaim, priceEntries, recordPhoto, replyToClaim, replyToCondition, sealSession, startCaptureSession } from './index.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'
const now = new Date('2026-10-20T12:00:00Z')
let database: TestDatabase
let shop: ReadyRentalShop
beforeAll(async () => { database = await createTestDatabase(); shop = await readyRentalShop(database, 'lifecycle-record', now) })
afterAll(async () => { await database.$client.close() })

it('automatically versions sealed evidence, condition reply, comparison and the human claim history', async () => {
  const rental = await shop.readyRental()
  const latest = async () => {
    const [version] = await shop.act((transaction) => evidenceVersions(transaction, rental.rentalId))
    return version === undefined ? undefined : shop.act((transaction) => evidencePackFor(transaction, rental.rentalId, version.id))
  }
  for (const kind of ['handover', 'return'] as const) {
    const opened = await shop.act((transaction) => startCaptureSession(transaction, { rentalId: rental.rentalId, rentalItemId: rental.rentalItemIds[0] ?? '', kind, actorUserId: shop.scope.userId ?? null }, now))
    if (!opened.ok) throw new Error(opened.reason)
    const session = await shop.act((transaction) => captureSession(transaction, opened.sessionId))
    for (const view of session?.plan.filter((view) => view.required) ?? []) await shop.act((transaction) => recordPhoto(transaction, opened.sessionId, { view: view.key, evidenceKey: `${opened.sessionId}/${view.key}`, sha256: 'a'.repeat(64), quality: { sharpness: 120, shadows: 20, highlights: 220, filled: 0.6 } }, now))
    await shop.act((transaction) => sealSession(transaction, opened.sessionId, now))
    expect((await latest())?.snapshot.items[0]?.sessions.some((session) => session.kind === kind)).toBe(true)
    if (kind === 'handover') {
      await shop.act((transaction) => replyToCondition(transaction, rental.rentalId, { kind: 'confirmed' }, now))
      expect((await latest())?.snapshot.rental.conditionReply).toBe('confirmed')
    }
  }
  const [comparison] = await shop.act((transaction) => transaction.select().from(comparisons).where(eq(comparisons.shopId, shop.scope.shopId)))
  if (comparison === undefined) throw new Error('No comparison')
  await shop.act((transaction) => beginComparison(transaction, comparison.id, now))
  await shop.act((transaction) => completeComparison(transaction, comparison.id, now, { state: 'deferred', model: 'unavailable', promptVersion: 'test-v1', alignment: {}, reason: 'model_unavailable', simulated: false, findings: [] }, now))
  expect((await latest())?.snapshot.comparisons[0]).toMatchObject({ state: 'deferred', promptVersion: 'test-v1' })
  const [price] = await shop.act((transaction) => transaction.select().from(priceEntries))
  const draft = await shop.act((transaction) => draftClaim(transaction, rental.rentalId, shop.scope.userId ?? '', [{ priceEntryId: price?.id ?? '', reason: 'Ana inspected the fresh scratch.' }], now))
  if (!draft.ok) throw new Error(draft.reason)
  expect((await latest())?.snapshot.claim?.lines[0]).toMatchObject({ amountCents: 3500, actorName: 'Ana' })
  await shop.act((transaction) => approveClaim(transaction, draft.claimId, shop.scope.userId ?? '', now))
  expect((await latest())?.snapshot.approvals[0]).toMatchObject({ actorName: 'Ana', decision: 'approved' })
  await shop.act((transaction) => presentClaim(transaction, draft.claimId, shop.scope.userId ?? '', now))
  await shop.act((transaction) => replyToClaim(transaction, rental.rentalId, 'contest', 'The mark was already present.', now))
  expect((await latest())?.snapshot.replies[0]).toMatchObject({ decision: 'contest', comment: 'The mark was already present.' })
})
