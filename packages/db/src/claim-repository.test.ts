import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { approveClaim, confirmCleanReturn, draftClaim, presentClaim } from './claim-repository.ts'
import { captureSession, recordPhoto, sealSession, startCaptureSession } from './capture-repository.ts'
import { approvals, claims, executions, holds, outbox, priceEntries, rentals, staffRoles, users } from './schema/index.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'
import { createTestDatabase } from './testing/test-database.ts'

const NOW = new Date('2026-10-20T09:00:00Z')
let database: Awaited<ReturnType<typeof createTestDatabase>>
let shop: ReadyRentalShop
let other: ReadyRentalShop
let counterId: string
let priceId: string

async function returned() {
  const rental = await shop.readyRental()
  for (const kind of ['handover', 'return'] as const) {
    const started = await shop.act((transaction) => startCaptureSession(transaction, { rentalId: rental.rentalId, rentalItemId: rental.rentalItemIds[0] ?? '', kind, actorUserId: shop.scope.userId ?? null }, NOW))
    if (!started.ok) throw new Error(started.reason)
    const session = await shop.act((transaction) => captureSession(transaction, started.sessionId))
    for (const view of session?.plan.filter((view) => view.required) ?? []) await shop.act((transaction) => recordPhoto(transaction, started.sessionId, { view: view.key, evidenceKey: randomUUID(), sha256: randomUUID(), quality: { sharpness: 120, shadows: 20, highlights: 220, filled: .6 } }, NOW))
    await shop.act((transaction) => sealSession(transaction, started.sessionId, NOW))
  }
  return rental.rentalId
}

beforeAll(async () => {
  database = await createTestDatabase()
  shop = await readyRentalShop(database, 'claim', NOW)
  other = await readyRentalShop(database, 'other-claim', NOW)
  priceId = (await shop.act((transaction) => transaction.select().from(priceEntries)))[0]?.id ?? ''
  const [counter] = await database.insert(users).values({ cognitoSubject: 'claim-counter', email: 'counter@claim.example', name: 'Counter' }).returning()
  counterId = counter?.id ?? ''
  await database.insert(staffRoles).values({ shopId: shop.scope.shopId, userId: counterId, role: 'counter_staff', approvalLimitCents: 1000 })
})

describe('claim preparation and approval', () => {
  it('prices a named manual line from the agreed list and approves only within the staff limit', async () => {
    const rentalId = await returned()
    const draft = await shop.act((transaction) => draftClaim(transaction, rentalId, counterId, [{ priceEntryId: priceId, reason: 'Fresh scratch inspected on the frame.' }], NOW))
    expect(draft).toMatchObject({ ok: true, totalCents: 3500 })
    if (!draft.ok) throw new Error(draft.reason)
    expect(await shop.act((transaction) => approveClaim(transaction, draft.claimId, counterId, NOW))).toEqual({ ok: false, reason: 'over_approval_limit' })
    expect(await shop.act((transaction) => approveClaim(transaction, draft.claimId, shop.scope.userId ?? '', NOW))).toMatchObject({ ok: true })
    expect(await other.act((transaction) => approveClaim(transaction, draft.claimId, other.scope.userId ?? '', NOW))).toEqual({ ok: false, reason: 'not_found' })
    expect((await shop.act((transaction) => transaction.select().from(executions))).filter((row) => row.action === 'capture')).toHaveLength(0)
    const presented = await shop.act((transaction) => presentClaim(transaction, draft.claimId, shop.scope.userId ?? '', NOW))
    expect(presented).toMatchObject({ ok: true, rentalId })
    expect((await shop.act((transaction) => transaction.select().from(claims).where(eq(claims.id, draft.claimId))))[0]).toMatchObject({ state: 'presented', totalCents: 3500, presentedAt: NOW })
    expect((await shop.act((transaction) => transaction.select().from(approvals).where(eq(approvals.subjectId, draft.claimId))))).toHaveLength(1)
  })
  it('refuses an empty reason, prices outside the agreement and a rental not yet returned', async () => {
    const rentalId = await returned()
    expect(await shop.act((transaction) => draftClaim(transaction, rentalId, counterId, [{ priceEntryId: priceId, reason: '' }], NOW))).toEqual({ ok: false, reason: 'line_without_evidence' })
    const foreignPrice = (await other.act((transaction) => transaction.select().from(priceEntries)))[0]?.id ?? ''
    expect(await shop.act((transaction) => draftClaim(transaction, rentalId, counterId, [{ priceEntryId: foreignPrice, reason: 'Wrong list' }], NOW))).toEqual({ ok: false, reason: 'price_not_agreed' })
    const notReturned = await shop.readyRental()
    expect(await shop.act((transaction) => draftClaim(transaction, notReturned.rentalId, counterId, [{ priceEntryId: priceId, reason: 'Too soon' }], NOW))).toEqual({ ok: false, reason: 'not_returned' })
  })
  it('requires a written human confirmation before releasing a deferred comparison, then queues one release', async () => {
    const rentalId = await returned()
    expect(await shop.act((transaction) => confirmCleanReturn(transaction, rentalId, counterId, '', NOW))).toEqual({ ok: false, reason: 'inspection_required' })
    const result = await shop.act((transaction) => confirmCleanReturn(transaction, rentalId, counterId, 'Inspected every returned item in person; no damage.', NOW))
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) throw new Error(result.reason)
    expect(await shop.act((transaction) => confirmCleanReturn(transaction, rentalId, counterId, 'Same confirmation', NOW))).toEqual(result)
    expect((await shop.act((transaction) => transaction.select().from(holds).where(eq(holds.rentalId, rentalId))))[0]?.state).toBe('releasing')
    expect((await shop.act((transaction) => transaction.select().from(rentals).where(eq(rentals.id, rentalId))))[0]?.state).toBe('settling')
    expect((await shop.act((transaction) => transaction.select().from(outbox).where(eq(outbox.messageGroup, rentalId)))).filter((row) => row.payload['executionId'] === result.executionId)).toHaveLength(1)
  })
})

describe('contested claims', () => {
  it('does not charge a contest and only an eligible independent manager can decide it', async () => {
    const rentalId = await returned()
    const { replyToClaim } = await import('./claim-reply-repository.ts')
    const { decideClaim } = await import('./claim-decision-repository.ts')
    const draft = await shop.act((transaction) => draftClaim(transaction, rentalId, shop.scope.userId ?? '', [{ priceEntryId: priceId, reason: 'Raised by owner.' }], NOW))
    if (!draft.ok) throw new Error(draft.reason)
    await shop.act((transaction) => approveClaim(transaction, draft.claimId, shop.scope.userId ?? '', NOW))
    await shop.act((transaction) => presentClaim(transaction, draft.claimId, shop.scope.userId ?? '', NOW))
    expect(await shop.act((transaction) => replyToClaim(transaction, rentalId, 'contest', 'This was already there.', NOW))).toMatchObject({ ok: true, executionId: null })
    expect(await shop.act((transaction) => decideClaim(transaction, draft.claimId, shop.scope.userId ?? '', 'waive', 'Owner agrees.', NOW))).toEqual({ ok: false, reason: 'raised_the_claim' })
    expect(await shop.act((transaction) => decideClaim(transaction, draft.claimId, counterId, 'uphold', 'No.', NOW))).toMatchObject({ ok: false })
    await database.update(staffRoles).set({ role: 'manager' }).where(eq(staffRoles.userId, counterId))
    expect(await shop.act((transaction) => decideClaim(transaction, draft.claimId, counterId, 'waive', 'The mark is visible at handover.', NOW))).toMatchObject({ ok: true })
    expect((await shop.act((transaction) => transaction.select().from(claims).where(eq(claims.id, draft.claimId))))[0]?.state).toBe('waived')
  })
})

it('shows the agreed price and settlement split without accepting a client amount', async () => {
  const { claimWorkspace } = await import('./claim-query.ts')
  const rentalId = await returned()
  const drafted = await shop.act((transaction) => draftClaim(transaction, rentalId, counterId, [{ priceEntryId: priceId, reason: 'Verified scratch.' }], NOW))
  expect(drafted.ok).toBe(true)
  expect(await shop.act((transaction) => claimWorkspace(transaction, rentalId))).toMatchObject({ rentalId, currency: 'EUR', reservedCents: 30000, claim: { totalCents: 3500 }, amounts: { capture: { cents: 3500 }, release: { cents: 26500 }, invoice: { cents: 0 } }, lines: [{ description: 'Scratch', reason: 'Verified scratch.', actorName: 'Counter' }] })
})

it('shows a waived claim as zero capture while retaining its original lines in the audit record', async () => {
  const { claimWorkspace } = await import('./claim-query.ts')
  const { decideClaim } = await import('./claim-decision-repository.ts')
  const rentalId = await returned()
  const drafted = await shop.act((transaction) => draftClaim(transaction, rentalId, shop.scope.userId ?? '', [{ priceEntryId: priceId, reason: 'Initially reported scratch.' }], NOW))
  if (!drafted.ok) throw new Error(drafted.reason)
  await shop.act((transaction) => decideClaim(transaction, drafted.claimId, shop.scope.userId ?? '', 'waive', 'Confirmed this is ordinary wear.', NOW))
  expect(await shop.act((transaction) => claimWorkspace(transaction, rentalId))).toMatchObject({ amounts: { capture: { cents: 0 }, release: { cents: 30000 } }, lines: [{ amountCents: 3500 }] })
})
