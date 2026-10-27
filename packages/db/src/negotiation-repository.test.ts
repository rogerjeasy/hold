import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { decideClaim } from './claim-decision-repository.ts'
import { evidenceSnapshot } from './evidence-snapshot.ts'
import { verifyTranscript } from './negotiation-fingerprint.ts'
import { applyNegotiationMove, openAdvocate, stopRenterAdvocate } from './negotiation-repository.ts'
import { confirmAgreement, issueSettlementCode } from './negotiation-settlement.ts'
import { negotiationRecords, negotiationTranscript, renterNegotiation, shopNegotiation } from './negotiation-view.ts'
import { grantShopSettlement, liveShopSettlement, revokeShopSettlement } from './settlement-mandate-repository.ts'
import { approvals, auditLog, claims, executions, mandates, negotiationMoves, negotiations, outbox, renterLinks, rentals, staffRoles, users } from './schema/index.ts'
import { inShop } from './scope.ts'
import type { Transaction } from './scope.ts'
import { presentedClaim, twoLinePrices } from './testing/presented-claim.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

const NOW = new Date('2026-10-20T09:00:00Z')
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)
let database: TestDatabase
let shop: ReadyRentalShop
let other: ReadyRentalShop
let counterId: string
let prices: { readonly scratch: string; readonly fork: string }
const ownerId = () => shop.scope.userId ?? ''
const asWorker = <Result>(work: (transaction: Transaction) => Promise<Result>) => inShop(database, { role: 'hold_worker', shopId: shop.scope.shopId }, work)
const shopLimits = { lowestSharePercent: 50, largestClaimCents: 200_00, rounds: 6, evidenceRequired: true, finalTap: true }

// A returned rental with a presented claim of two lines at 35.00 each, raised by the counter staff member.
const presented = () => presentedClaim(shop, prices, counterId, NOW)

const shopAgent = () => ({ kind: 'shop_agent' as const, shopId: shop.scope.shopId, actsFor: ownerId() })
async function renterAgent(rentalId: string) {
  const [rental] = await shop.act((transaction) => transaction.select({ renterId: rentals.renterId }).from(rentals).where(eq(rentals.id, rentalId)))
  return { kind: 'renter_agent' as const, shopId: shop.scope.shopId, actsFor: rental?.renterId ?? '' }
}
async function lineIds(claimId: string) {
  const records = await asWorker((transaction) => negotiationRecordsFor(transaction, claimId))
  return records.lines.map((line) => line.lineId)
}
async function negotiationRecordsFor(transaction: Transaction, claimId: string) {
  const [row] = await transaction.select({ id: negotiations.id }).from(negotiations).where(eq(negotiations.claimId, claimId))
  const records = await negotiationRecords(transaction, row?.id ?? '')
  if (records === undefined) throw new Error('No negotiation.')
  return records
}
const offer = (ids: readonly string[], amounts: readonly number[]) => ({ lines: ids.map((lineId, index) => ({ lineId, cents: amounts[index] ?? 0, ground: (amounts[index] ?? 0) < 35_00 ? 'ordinary_wear' : null, evidence: (amounts[index] ?? 0) < 35_00 ? ['wear-1'] : [] })) })

async function negotiating() {
  const claim = await presented()
  const opened = await shop.act((transaction) => openAdvocate(transaction, { rentalId: claim.rentalId, highestTotalCents: 50_00, comment: '', simulated: true }, NOW))
  if (!opened.ok) throw new Error(opened.reason)
  return { ...claim, negotiationId: opened.negotiationId, renter: await renterAgent(claim.rentalId), lines: await lineIds(claim.claimId) }
}
const move = (negotiationId: string, actor: Parameters<typeof applyNegotiationMove>[1]['actor'], tool: 'offer' | 'accept' | 'pass', args: unknown, at: Date) =>
  asWorker((transaction) => applyNegotiationMove(transaction, { negotiationId, actor, tool, arguments: args, model: 'simulated', promptVersion: 'test-1' }, at))

beforeAll(async () => {
  database = await createTestDatabase()
  shop = await readyRentalShop(database, 'negotiation', NOW)
  other = await readyRentalShop(database, 'negotiation-other', NOW)
  prices = await twoLinePrices(shop, NOW)
  const [counter] = await database.insert(users).values({ cognitoSubject: 'negotiation-counter', email: 'counter@negotiation.example', name: 'Counter' }).returning()
  counterId = counter?.id ?? ''
  await database.insert(staffRoles).values({ shopId: shop.scope.shopId, userId: counterId, role: 'counter_staff', approvalLimitCents: 100_00 })
})
afterAll(async () => { await database.$client.close() })


describe('the shop’s settlement mandate', () => {
  it('is granted by the owner only, with typed limits, and is invisible to another shop', async () => {
    expect(await shop.act((transaction) => grantShopSettlement(transaction, counterId, shopLimits, 30, NOW))).toEqual({ ok: false, reason: 'role_may_not_confirm' })
    expect(await shop.act((transaction) => grantShopSettlement(transaction, ownerId(), { ...shopLimits, lowestSharePercent: 120 }, 30, NOW))).toEqual({ ok: false, reason: 'invalid_limits' })
    const granted = await shop.act((transaction) => grantShopSettlement(transaction, ownerId(), shopLimits, 30, NOW))
    expect(granted).toMatchObject({ ok: true })
    expect(await shop.act((transaction) => liveShopSettlement(transaction, NOW))).toMatchObject({ kind: 'settlement_shop', limits: { currency: 'EUR', ...shopLimits } })
    expect(await other.act((transaction) => liveShopSettlement(transaction, NOW))).toBeUndefined()
    expect(await other.act((transaction) => transaction.select().from(mandates))).toEqual([])
  })
})

describe('a negotiation between two advocates', () => {
  it('opens on a contest with an advocate: the claim negotiates, the shop opens with the claim, and the worker is asked', async () => {
    const claim = await negotiating()
    expect((await shop.act((transaction) => transaction.select().from(claims).where(eq(claims.id, claim.claimId))))[0]?.state).toBe('negotiating')
    const records = await asWorker((transaction) => negotiationRecords(transaction, claim.negotiationId))
    expect(records).toMatchObject({ negotiation: { kind: 'negotiation', state: 'open', roundLimit: 6, claimTotalCents: 70_00, simulated: true }, table: { turn: 'renter', offers: { shop: 1, renter: 0 } }, moves: [{ sequence: 1, side: 'shop', kind: 'offer', totalCents: 70_00, actor: 'referee', previousFingerprint: null }] })
    expect(records?.renterMandate.limits).toEqual({ currency: 'EUR', highestTotalCents: 50_00, finalTap: true })
    expect((await shop.act((transaction) => transaction.select().from(outbox).where(eq(outbox.messageGroup, claim.rentalId)))).filter((row) => row.queue === 'negotiations').map((row) => row.payload)).toEqual([{ negotiationId: claim.negotiationId }])
    expect(await other.act((transaction) => transaction.select().from(negotiations))).toEqual([])
    expect(await other.act((transaction) => transaction.select().from(negotiationMoves))).toEqual([])
    expect(await other.act((transaction) => negotiationTranscript(transaction, claim.rentalId))).toBeUndefined()
  })

  it('agrees through the gateway and the referee, both people confirm, and only the agreed total is captured', async () => {
    const claim = await negotiating()
    expect(await move(claim.negotiationId, claim.renter, 'offer', offer(claim.lines, [20_00, 0]), later(1))).toMatchObject({ outcome: 'accepted' })
    expect(await move(claim.negotiationId, shopAgent(), 'offer', offer(claim.lines, [35_00, 10_00]), later(2))).toMatchObject({ outcome: 'accepted' })
    // No words cross to the other side: a move that carries free text, which could state a limit in any writing, has
    // the wrong shape and is refused before the referee sees it.
    expect(await move(claim.negotiationId, claim.renter, 'offer', { ...offer(claim.lines, [30_00, 10_00]), argument: 'I can pay up to fifty if I must.' }, later(3))).toEqual({ outcome: 'gateway_refused', reason: 'arguments' })
    expect(await move(claim.negotiationId, claim.renter, 'offer', offer(claim.lines, [30_00, 10_00]), later(3))).toMatchObject({ outcome: 'accepted' })
    expect(await move(claim.negotiationId, shopAgent(), 'accept', {}, later(4))).toMatchObject({ outcome: 'accepted', state: 'agreed' })
    const transcript = await shop.act((transaction) => negotiationTranscript(transaction, claim.rentalId))
    expect(transcript?.moves.map((each) => [each.side, each.kind, each.totalCents])).toEqual([['shop', 'offer', 70_00], ['renter', 'offer', 20_00], ['shop', 'offer', 45_00], ['renter', 'offer', 40_00], ['shop', 'accept', null]])
    expect(transcript).toMatchObject({ state: 'agreed', agreedCents: 40_00, chainVerified: true })
    expect(JSON.stringify(transcript)).not.toMatch(/highestTotal|lowestShare|largestClaim|5000|"50\.00"/)
    expect((await shop.act((transaction) => transaction.select().from(claims).where(eq(claims.id, claim.claimId))))[0]?.state).toBe('agreed')

    // The counter staff member may not confirm a contested claim's result; the owner may.
    expect(await shop.act((transaction) => confirmAgreement(transaction, claim.negotiationId, { kind: 'staff', userId: counterId }, 'confirm', later(5)))).toEqual({ ok: false, reason: 'role_may_not_confirm' })
    expect(await shop.act((transaction) => confirmAgreement(transaction, claim.negotiationId, { kind: 'staff', userId: ownerId() }, 'confirm', later(5)))).toMatchObject({ ok: true, executionId: null })
    expect((await shop.act((transaction) => transaction.select().from(executions).where(eq(executions.rentalId, claim.rentalId)))).filter((row) => row.action === 'capture')).toEqual([])
    const settled = await shop.act((transaction) => confirmAgreement(transaction, claim.negotiationId, { kind: 'renter' }, 'confirm', later(6)))
    expect(settled).toMatchObject({ ok: true })
    const [row] = await shop.act((transaction) => transaction.select().from(claims).where(eq(claims.id, claim.claimId)))
    expect(row).toMatchObject({ state: 'charging', totalCents: 40_00 })
    const capture = (await shop.act((transaction) => transaction.select().from(executions).where(eq(executions.rentalId, claim.rentalId)))).filter((each) => each.action === 'capture')
    expect(capture.map((each) => each.amountCents)).toEqual([40_00])
    const negotiation = await asWorker((transaction) => negotiationRecords(transaction, claim.negotiationId))
    const approval = (await shop.act((transaction) => transaction.select().from(approvals).where(eq(approvals.subjectId, claim.claimId)))).find((each) => each.method === 'mandate')
    expect(approval).toMatchObject({ decision: 'approved', mandateId: negotiation?.negotiation.shopMandateId, changes: [{ totalCents: 40_00, previousTotalCents: 70_00, shopMandateId: negotiation?.negotiation.shopMandateId, renterMandateId: negotiation?.negotiation.renterMandateId, lastMoveFingerprint: negotiation?.negotiation.headFingerprint }] })
    expect(negotiation?.negotiation.state).toBe('settled')
  })

  it('refuses a lowered line whose ground fails, tells only that side, and writes no move (X4.5)', async () => {
    const claim = await negotiating()
    const bad = { lines: claim.lines.map((lineId) => ({ lineId, cents: 0, ground: 'known_mark', evidence: ['mark-404'] })) }
    expect(await move(claim.negotiationId, claim.renter, 'offer', bad, later(1))).toEqual({ outcome: 'refused', reason: 'ground_check_failed' })
    const records = await asWorker((transaction) => negotiationRecords(transaction, claim.negotiationId))
    expect(records?.moves).toHaveLength(1)
    expect(records?.negotiation.renterRefusals).toBe(1)
    // The shop's side of the record learns that the renter's advocate was refused, never why.
    const audit = await shop.act((transaction) => transaction.select({ action: auditLog.action, detail: auditLog.detail }).from(auditLog).where(and(eq(auditLog.subjectId, claim.negotiationId), eq(auditLog.actorKind, 'renter_agent'))))
    expect(audit).toEqual([{ action: 'negotiation.refused', detail: {} }])
    expect(await move(claim.negotiationId, claim.renter, 'offer', bad, later(2))).toEqual({ outcome: 'refused', reason: 'ground_check_failed' })
    expect((await shop.act((transaction) => transaction.select().from(claims).where(eq(claims.id, claim.claimId))))[0]?.state).toBe('escalated')
  })

  it('lets each agent move only for its own side, in its own shop, with arguments of the right shape', async () => {
    const claim = await negotiating()
    expect(await move(claim.negotiationId, { ...claim.renter, kind: 'public_agent' as const }, 'offer', offer(claim.lines, [20_00, 0]), later(1))).toEqual({ outcome: 'gateway_refused', reason: 'tier' })
    expect(await move(claim.negotiationId, { ...claim.renter, actsFor: '' }, 'offer', offer(claim.lines, [20_00, 0]), later(1))).toEqual({ outcome: 'gateway_refused', reason: 'actor' })
    expect(await move(claim.negotiationId, { ...claim.renter, shopId: other.scope.shopId }, 'offer', offer(claim.lines, [20_00, 0]), later(1))).toEqual({ outcome: 'gateway_refused', reason: 'shop' })
    expect(await move(claim.negotiationId, claim.renter, 'offer', { lines: claim.lines.map((lineId) => ({ lineId, cents: '0' })), amount: 1 }, later(1))).toEqual({ outcome: 'gateway_refused', reason: 'arguments' })
    // The shop's advocate cannot move in the renter's turn.
    expect(await move(claim.negotiationId, shopAgent(), 'accept', {}, later(1))).toEqual({ outcome: 'refused', reason: 'not_your_turn' })
  })

  it('sends the claim to the owner with nothing captured when the renter stops the advocate (X4.6), and never negotiates it again (X4.7)', async () => {
    const claim = await negotiating()
    await move(claim.negotiationId, claim.renter, 'offer', offer(claim.lines, [20_00, 0]), later(1))
    expect(await shop.act((transaction) => stopRenterAdvocate(transaction, claim.rentalId, later(2)))).toEqual({ ok: true })
    expect((await shop.act((transaction) => transaction.select().from(claims).where(eq(claims.id, claim.claimId))))[0]?.state).toBe('escalated')
    expect(await move(claim.negotiationId, shopAgent(), 'accept', {}, later(3))).toEqual({ outcome: 'refused', reason: 'not_open' })
    expect((await shop.act((transaction) => transaction.select().from(executions).where(eq(executions.rentalId, claim.rentalId)))).filter((row) => row.action === 'capture')).toEqual([])
    expect(await shop.act((transaction) => openAdvocate(transaction, { rentalId: claim.rentalId, highestTotalCents: 70_00, comment: '', simulated: true }, later(4)))).toEqual({ ok: false, reason: 'already_replied' })
    const records = await asWorker((transaction) => negotiationRecords(transaction, claim.negotiationId))
    const second = database.insert(negotiations).values({ shopId: shop.scope.shopId, claimId: claim.claimId, rentalId: claim.rentalId, kind: 'negotiation', shopMandateId: records?.negotiation.shopMandateId, renterMandateId: records?.negotiation.renterMandateId ?? '', currency: 'EUR', claimTotalCents: 70_00, roundLimit: 6, deadline: later(600), openedAt: later(4), updatedAt: later(4) })
    await expect(second).rejects.toThrow()
    // The owner decides with the transcript.
    expect(await shop.act((transaction) => decideClaim(transaction, claim.claimId, ownerId(), 'waive', 'The advocate was stopped; the scratches are wear.', later(5)))).toMatchObject({ ok: true })
    expect((await shop.act((transaction) => transaction.select().from(claims).where(eq(claims.id, claim.claimId))))[0]?.state).toBe('waived')
  })

  it('issues the renter’s code to confirm only for an agreement awaiting them, through a link that may accept', async () => {
    const claim = await negotiating()
    const [link] = await database.insert(renterLinks).values({ shopId: shop.scope.shopId, rentalId: claim.rentalId, tokenFingerprint: `settle-${claim.rentalId}`, scopes: ['view', 'accept', 'contest'], expiresAt: later(60 * 24 * 30) }).returning()
    const [viewOnly] = await database.insert(renterLinks).values({ shopId: shop.scope.shopId, rentalId: claim.rentalId, tokenFingerprint: `view-${claim.rentalId}`, scopes: ['view'], expiresAt: later(60 * 24 * 30) }).returning()
    expect(await shop.act((transaction) => issueSettlementCode(transaction, link?.id ?? '', 'digest', later(1)))).toEqual({ ok: false, reason: 'not_agreed' })
    await move(claim.negotiationId, claim.renter, 'offer', offer(claim.lines, [35_00, 0]), later(1))
    await move(claim.negotiationId, shopAgent(), 'accept', {}, later(2))
    expect(await shop.act((transaction) => issueSettlementCode(transaction, viewOnly?.id ?? '', 'digest', later(3)))).toEqual({ ok: false, reason: 'link_invalid' })
    expect(await shop.act((transaction) => issueSettlementCode(transaction, link?.id ?? '', 'digest', later(3)))).toMatchObject({ ok: true, email: 'priya@example.com' })
  })

  it('shapes what each side’s screen reads on the server: its own limit and taps, never the other side’s', async () => {
    const claim = await negotiating()
    await move(claim.negotiationId, claim.renter, 'offer', offer(claim.lines, [35_00, 0]), later(1))
    await move(claim.negotiationId, shopAgent(), 'accept', {}, later(2))
    const forShop = await shop.act((transaction) => shopNegotiation(transaction, claim.rentalId))
    const forRenter = await shop.act((transaction) => renterNegotiation(transaction, claim.rentalId))
    expect(forShop).toMatchObject({ awaitingShop: true, transcript: { state: 'agreed', agreedCents: 35_00 } })
    expect(forRenter).toMatchObject({ awaitingRenter: true, highestTotalCents: 50_00, stopped: false, transcript: { state: 'agreed' } })
    expect(JSON.stringify(forShop)).not.toMatch(/highestTotal|awaitingRenter|5000/)
    expect(JSON.stringify(forRenter)).not.toMatch(/lowestShare|largestClaim|awaitingShop|evidenceRequired|20000/)
    expect(await other.act((transaction) => shopNegotiation(transaction, claim.rentalId))).toBeUndefined()
  })

  it('escalates when a person declines the agreed result', async () => {
    const claim = await negotiating()
    await move(claim.negotiationId, claim.renter, 'offer', offer(claim.lines, [20_00, 20_00]), later(1))
    await move(claim.negotiationId, shopAgent(), 'accept', {}, later(2))
    expect(await shop.act((transaction) => confirmAgreement(transaction, claim.negotiationId, { kind: 'renter' }, 'decline', later(3)))).toEqual({ ok: true, executionId: null })
    expect((await shop.act((transaction) => transaction.select().from(claims).where(eq(claims.id, claim.claimId))))[0]?.state).toBe('escalated')
    expect((await asWorker((transaction) => negotiationRecords(transaction, claim.negotiationId)))?.negotiation).toMatchObject({ state: 'escalated', endedReason: 'declined' })
  })

  it('escalates every negotiation under the shop’s mandate when the owner revokes it', async () => {
    const claim = await negotiating()
    expect(await shop.act((transaction) => revokeShopSettlement(transaction, ownerId(), later(1)))).toEqual({ ok: true })
    expect((await shop.act((transaction) => transaction.select().from(claims).where(eq(claims.id, claim.claimId))))[0]?.state).toBe('escalated')
    await shop.act((transaction) => grantShopSettlement(transaction, ownerId(), shopLimits, 30, NOW))
  })
})

describe('the transcript in the evidence pack (X4.8)', () => {
  it('carries every move with its fingerprints, never either side’s limits, and its chain verifies', async () => {
    const claim = await negotiating()
    await move(claim.negotiationId, claim.renter, 'offer', offer(claim.lines, [35_00, 0]), later(1))
    await move(claim.negotiationId, shopAgent(), 'accept', {}, later(2))
    const snapshot = await shop.act((transaction) => evidenceSnapshot(transaction, claim.rentalId))
    expect(snapshot?.negotiation).toMatchObject({ kind: 'negotiation', state: 'agreed', agreedCents: 35_00, moves: [{ sequence: 1, side: 'shop', totalCents: 70_00 }, { sequence: 2, side: 'renter', totalCents: 35_00, lines: [{ cents: 35_00, ground: null, evidence: [] }, { cents: 0, ground: 'ordinary_wear', evidence: ['wear-1'] }] }, { sequence: 3, kind: 'accept' }] })
    const moves = snapshot?.negotiation?.moves.map((each) => ({ ...each, createdAt: new Date(each.createdAt) })) ?? []
    expect(verifyTranscript(moves)).toEqual({ ok: true })
    expect(JSON.stringify(snapshot?.negotiation)).not.toMatch(/highestTotal|lowestShare|largestClaim|finalTap|evidenceRequired|5000/)
  })
})

describe('the transcript', () => {
  it('is append-only and chained: no move changes, disappears, or joins out of order', async () => {
    const claim = await negotiating()
    await expect(database.update(negotiationMoves).set({ totalCents: 1 }).where(eq(negotiationMoves.negotiationId, claim.negotiationId))).rejects.toThrow()
    await expect(database.delete(negotiationMoves).where(eq(negotiationMoves.negotiationId, claim.negotiationId))).rejects.toThrow()
    await expect(asWorker((transaction) => transaction.update(negotiationMoves).set({ actor: 'changed' }).where(eq(negotiationMoves.negotiationId, claim.negotiationId)))).rejects.toThrow()
    await expect(database.insert(negotiationMoves).values({ shopId: shop.scope.shopId, negotiationId: claim.negotiationId, sequence: 2, side: 'renter', kind: 'pass', passReason: 'chose', actor: 'renter_advocate', previousFingerprint: 'f'.repeat(64), fingerprint: 'e'.repeat(64) })).rejects.toThrow()
  })
})

describe('when only the renter has an advocate (section 9.10)', () => {
  it('writes the renter’s contest, and the owner decides as in the spine', async () => {
    await shop.act((transaction) => revokeShopSettlement(transaction, ownerId(), NOW))
    const claim = await presented()
    const opened = await shop.act((transaction) => openAdvocate(transaction, { rentalId: claim.rentalId, highestTotalCents: 50_00, comment: 'Both were there.', simulated: true }, NOW))
    expect(opened).toMatchObject({ ok: true, kind: 'reply' })
    if (!opened.ok) throw new Error(opened.reason)
    expect((await shop.act((transaction) => transaction.select().from(claims).where(eq(claims.id, claim.claimId))))[0]?.state).toBe('contested')
    const ids = await lineIds(claim.claimId)
    expect(await move(opened.negotiationId, await renterAgent(claim.rentalId), 'offer', offer(ids, [10_00, 0]), later(1))).toMatchObject({ outcome: 'accepted', state: 'replied' })
    expect(await shop.act((transaction) => negotiationTranscript(transaction, claim.rentalId))).toMatchObject({ kind: 'reply', state: 'replied', moves: [{ side: 'renter', totalCents: 10_00, lines: [{ ground: 'ordinary_wear', evidence: ['wear-1'] }, { ground: 'ordinary_wear', evidence: ['wear-1'] }] }] })
    expect(await shop.act((transaction) => decideClaim(transaction, claim.claimId, ownerId(), 'uphold', 'Both scratches are fresh.', later(2)))).toMatchObject({ ok: true })
    await shop.act((transaction) => grantShopSettlement(transaction, ownerId(), shopLimits, 30, NOW))
  })
})
