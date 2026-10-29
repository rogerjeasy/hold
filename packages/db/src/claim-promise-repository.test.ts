import { decideByFor, detectExceptions } from '@hold/domain'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { claimMessages, keepClaimPromise, promiseFor, saveDecisionPromiseDays, writeClaimMessage } from './claim-promise-repository.ts'
import { decideClaim } from './claim-decision-repository.ts'
import { replyToClaim } from './claim-reply-repository.ts'
import { shopSnapshot } from './ops-repository.ts'
import { grantStandingRule, revokeMandate } from './ops-settings-repository.ts'
import { approvals, auditLog, authorizations, claims, executions, holds, outbox, shops, staffRoles, users } from './schema/index.ts'
import { inShop } from './scope.ts'
import type { Transaction } from './scope.ts'
import { presentedClaim, twoLinePrices } from './testing/presented-claim.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

const NOW = new Date('2026-11-03T10:00:00Z')
const HOUR = 3_600_000
const later = (hours: number) => new Date(NOW.getTime() + hours * HOUR)
let database: TestDatabase
let shop: ReadyRentalShop
let other: ReadyRentalShop
let prices: { readonly scratch: string; readonly fork: string }
let counterId: string
let managerId: string

async function staff(subject: string, role: 'manager' | 'counter_staff') {
  const [person] = await database.insert(users).values({ cognitoSubject: subject, email: `${subject}@shop.example`, name: subject, language: 'en' }).returning()
  await database.insert(staffRoles).values({ shopId: shop.scope.shopId, userId: person?.id ?? '', role })
  return person?.id ?? ''
}

const asWorker = <Result>(work: (transaction: Transaction) => Promise<Result>) => inShop(database, { role: 'hold_worker', shopId: shop.scope.shopId }, work)
const asPerson = <Result>(userId: string, work: (transaction: Transaction) => Promise<Result>) => inShop(database, { role: 'hold_app', shopId: shop.scope.shopId, userId }, work)
const claimRow = async (claimId: string) => (await database.select().from(claims).where(eq(claims.id, claimId)))[0]

async function contested(at = NOW) {
  const claim = await presentedClaim(shop, prices, counterId, at)
  const replied = await shop.act((transaction) => replyToClaim(transaction, claim.rentalId, 'contest', 'It was already scratched.', at))
  if (!replied.ok) throw new Error(replied.reason)
  return claim
}

beforeAll(async () => {
  database = await createTestDatabase()
  shop = await readyRentalShop(database, 'promise', NOW)
  other = await readyRentalShop(database, 'promise-other', NOW)
  prices = await twoLinePrices(shop, NOW)
  counterId = await staff('promise-counter', 'counter_staff')
  managerId = await staff('promise-manager', 'manager')
})
afterAll(async () => { await database.$client.close() })

describe('the promise a claim carries', () => {
  it('keeps the days the shop promised when the claim was presented, and fixes the date when the renter contests', async () => {
    await shop.act((transaction) => saveDecisionPromiseDays(transaction, shop.scope.shopId, 3))
    const claim = await presentedClaim(shop, prices, counterId, NOW)
    await shop.act((transaction) => saveDecisionPromiseDays(transaction, shop.scope.shopId, 5))
    expect(await claimRow(claim.claimId)).toMatchObject({ promiseDays: 3, decideBy: null })
    const contestedAt = later(2)
    await shop.act((transaction) => replyToClaim(transaction, claim.rentalId, 'contest', 'Not me.', contestedAt))
    const [hold] = await database.select({ validUntil: authorizations.validUntil }).from(holds).innerJoin(authorizations, eq(authorizations.id, holds.currentAuthorizationId)).where(eq(holds.rentalId, claim.rentalId))
    const decideBy = decideByFor({ contestedAt, days: 3, timeZone: 'UTC', closes: null, validUntil: hold?.validUntil ?? null })
    expect(await claimRow(claim.claimId)).toMatchObject({ state: 'contested', promiseDays: 3, decideBy })
    expect(await database.select().from(outbox).where(and(eq(outbox.queue, 'upkeep'), eq(outbox.messageGroup, claim.rentalId)))).toContainEqual(expect.objectContaining({ payload: { kind: 'claim_promise', claimId: claim.claimId } }))
    await shop.act((transaction) => saveDecisionPromiseDays(transaction, shop.scope.shopId, 3))
  })

  it('cannot be moved once made, by anyone', async () => {
    const claim = await contested()
    await expect(database.update(claims).set({ decideBy: later(500) }).where(eq(claims.id, claim.claimId))).rejects.toThrow()
    await expect(database.update(claims).set({ promiseDays: 9 }).where(eq(claims.id, claim.claimId))).rejects.toThrow()
  })

  it('is shown to the renter before they contest, and as a date once they have', async () => {
    const presented = await presentedClaim(shop, prices, counterId, NOW)
    expect(await shop.act((transaction) => promiseFor(transaction, presented.rentalId, NOW))).toMatchObject({ days: 3, decideBy: null, standing: 'none', missedReason: null })
    const claim = await contested()
    expect(await shop.act((transaction) => promiseFor(transaction, claim.rentalId, NOW))).toMatchObject({ days: 3, decideBy: expect.any(Date) as unknown, standing: 'open' })
  })
})

describe('keeping the promise', () => {
  it('does nothing before the date, and records a contest decided by it as kept', async () => {
    const claim = await contested()
    expect(await asWorker((transaction) => keepClaimPromise(transaction, claim.claimId, later(1)))).toMatchObject({ outcome: 'not_due' })
    const decided = await asPerson(managerId, (transaction) => decideClaim(transaction, claim.claimId, managerId, 'waive', 'The photographs do not show it.', later(2)))
    expect(decided.ok).toBe(true)
    expect(await claimRow(claim.claimId)).toMatchObject({ decidedAt: later(2) })
    expect(await asWorker((transaction) => keepClaimPromise(transaction, claim.claimId, later(200)))).toMatchObject({ outcome: 'kept' })
    expect(await shop.act((transaction) => promiseFor(transaction, claim.rentalId, later(200)))).toMatchObject({ standing: 'kept' })
  })

  it('sends a claim undecided at the date to the owner, once, and leaves the decision to the owner alone', async () => {
    const claim = await contested()
    const due = (await claimRow(claim.claimId))?.decideBy ?? NOW
    expect(await asWorker((transaction) => keepClaimPromise(transaction, claim.claimId, due))).toMatchObject({ outcome: 'escalated', rentalId: claim.rentalId })
    expect(await claimRow(claim.claimId)).toMatchObject({ state: 'escalated', promiseMissedAt: due, decidedAt: null })
    expect(await asWorker((transaction) => keepClaimPromise(transaction, claim.claimId, later(500)))).toMatchObject({ outcome: 'already_missed' })
    expect(await database.select().from(auditLog).where(and(eq(auditLog.subjectId, claim.claimId), eq(auditLog.action, 'claim.promise_missed')))).toHaveLength(1)
    expect(await asPerson(managerId, (transaction) => decideClaim(transaction, claim.claimId, managerId, 'uphold', 'Clear damage.', later(500)))).toEqual({ ok: false, reason: 'owner_decides_after_promise' })
    const owner = shop.scope.userId ?? ''
    expect((await shop.act((transaction) => decideClaim(transaction, claim.claimId, owner, 'uphold', 'The scratch is new in the return photographs.', later(500)))).ok).toBe(true)
    expect(await shop.act((transaction) => promiseFor(transaction, claim.rentalId, later(500)))).toMatchObject({ standing: 'missed', missedReason: 'The scratch is new in the return photographs.' })
  })

  it('waives the claim and releases the hold under the owner rule, named in the approval, never charging', async () => {
    const mandateId = await shop.act((transaction) => grantStandingRule(transaction, shop.scope.userId ?? '', { dailyCount: 5, days: 30 }, NOW, 'decision_promise_missed'))
    const claim = await contested()
    const due = (await claimRow(claim.claimId))?.decideBy ?? NOW
    const kept = await asWorker((transaction) => keepClaimPromise(transaction, claim.claimId, due))
    expect(kept).toMatchObject({ outcome: 'waived', rentalId: claim.rentalId, executionId: expect.any(String) as unknown })
    expect(await claimRow(claim.claimId)).toMatchObject({ state: 'waived', promiseMissedAt: due, decidedAt: due })
    expect(await database.select().from(approvals).where(and(eq(approvals.subjectId, claim.claimId), eq(approvals.decision, 'waived')))).toEqual([expect.objectContaining({ method: 'mandate', mandateId, decidedByUserId: null })])
    const work = await database.select().from(executions).where(eq(executions.rentalId, claim.rentalId))
    expect(work.filter((row) => ['release', 'capture'].includes(row.action)).map((row) => row.action)).toEqual(['release'])
    await shop.act((transaction) => revokeMandate(transaction, mandateId, due))
  })

  it('leaves a claim to the owner when the rule has been revoked', async () => {
    const claim = await contested()
    const due = (await claimRow(claim.claimId))?.decideBy ?? NOW
    expect(await asWorker((transaction) => keepClaimPromise(transaction, claim.claimId, due))).toMatchObject({ outcome: 'escalated' })
  })
})

describe('the morning queue', () => {
  it('reads the promise, so the operations agent raises it in its last day', async () => {
    const claim = await contested()
    const due = (await claimRow(claim.claimId))?.decideBy ?? NOW
    const snapshot = await asWorker((transaction) => shopSnapshot(transaction, new Date(due.getTime() - 2 * HOUR), { disputes: [], differences: [] }))
    expect(snapshot.claims.find((row) => row.id === claim.claimId)).toMatchObject({ promise: { decideBy: due, decidedAt: null, promiseMissedAt: null } })
    expect(detectExceptions(snapshot).filter((each) => each.subjectId === claim.claimId).map((each) => each.kind)).toEqual(['decision_promise_due'])
  })
})

describe('words between the renter and the shop', () => {
  it('keeps both sides in order, named, on the claim', async () => {
    const claim = await contested()
    expect(await shop.act((transaction) => writeClaimMessage(transaction, { rentalId: claim.rentalId, author: 'renter', userId: null, body: '  The scratch was there at pickup.  ' }, later(1)))).toMatchObject({ ok: true })
    expect(await asPerson(managerId, (transaction) => writeClaimMessage(transaction, { rentalId: claim.rentalId, author: 'shop', userId: managerId, body: 'We are checking the photographs.' }, later(2)))).toMatchObject({ ok: true })
    expect(await shop.act((transaction) => claimMessages(transaction, claim.rentalId))).toEqual([
      expect.objectContaining({ author: 'renter', authorName: null, body: 'The scratch was there at pickup.', createdAt: later(1) }),
      expect.objectContaining({ author: 'shop', authorName: 'promise-manager', body: 'We are checking the photographs.', createdAt: later(2) }),
    ])
    expect(await other.act((transaction) => claimMessages(transaction, claim.rentalId))).toEqual([])
  })

  it('refuses an empty or overlong message, a claim not yet shown to the renter, and a read-only member', async () => {
    const claim = await contested()
    expect(await shop.act((transaction) => writeClaimMessage(transaction, { rentalId: claim.rentalId, author: 'renter', userId: null, body: '   ' }, NOW))).toEqual({ ok: false, reason: 'message_invalid' })
    expect(await shop.act((transaction) => writeClaimMessage(transaction, { rentalId: claim.rentalId, author: 'renter', userId: null, body: 'x'.repeat(1001) }, NOW))).toEqual({ ok: false, reason: 'message_invalid' })
    const rental = await shop.readyRental()
    expect(await shop.act((transaction) => writeClaimMessage(transaction, { rentalId: rental.rentalId, author: 'renter', userId: null, body: 'Hello' }, NOW))).toEqual({ ok: false, reason: 'not_found' })
    const reader = await staff('promise-reader', 'counter_staff')
    await database.update(staffRoles).set({ role: 'read_only' }).where(eq(staffRoles.userId, reader))
    expect(await asPerson(reader, (transaction) => writeClaimMessage(transaction, { rentalId: claim.rentalId, author: 'shop', userId: reader, body: 'Hi' }, NOW))).toEqual({ ok: false, reason: 'role_may_not_confirm' })
  })

  it('keeps every message as written', async () => {
    const claim = await contested()
    await shop.act((transaction) => writeClaimMessage(transaction, { rentalId: claim.rentalId, author: 'renter', userId: null, body: 'Original' }, NOW))
    await expect(shop.act((transaction) => transaction.execute(`update claim_messages set body = 'Changed' where claim_id = '${claim.claimId}'`))).rejects.toThrow()
    await expect(shop.act((transaction) => transaction.execute(`delete from claim_messages where claim_id = '${claim.claimId}'`))).rejects.toThrow()
  })
})

describe('the shop setting', () => {
  it('takes one to fourteen days', async () => {
    await expect(database.update(shops).set({ decisionPromiseDays: 0 }).where(eq(shops.id, shop.scope.shopId))).rejects.toThrow()
    await expect(database.update(shops).set({ decisionPromiseDays: 15 }).where(eq(shops.id, shop.scope.shopId))).rejects.toThrow()
  })
})
