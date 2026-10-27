import { auditLog, beginOpsRun, decideProposal, holds, inShop, proposals, recordExceptions, writeProposal } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import type { TestDatabase } from '@hold/db/testing'
import { readyRentalShop } from '@hold/db/testing/ready-rental'
import type { ReadyRentalShop } from '@hold/db/testing/ready-rental'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { carryOutProposal } from './carry-out.ts'
import type { CarryOutDependencies } from './carry-out.ts'

const now = new Date('2026-10-20T09:00:00Z')
let database: TestDatabase
let shop: ReadyRentalShop
beforeAll(async () => { database = await createTestDatabase(); shop = await readyRentalShop(database, 'carry-out', now) })
afterAll(async () => { await database.$client.close() })
const asWorker = <Result>(work: Parameters<typeof inShop<Result>>[2]) => inShop(database, { role: 'hold_worker', shopId: shop.scope.shopId }, work)

// An approved proposal of the kind, with its draft, waiting for the worker.
async function approved(kind: 'send_message' | 'respond_to_dispute', draft: string) {
  const rental = await shop.readyRental()
  const [hold] = await database.select().from(holds).where(eq(holds.rentalId, rental.rentalId))
  const exception = kind === 'send_message'
    ? { kind: 'hold_at_risk' as const, subjectKind: 'hold' as const, subjectId: hold?.id ?? '', allowed: ['send_invoice' as const, 'send_message' as const] }
    : { kind: 'dispute_open' as const, subjectKind: 'dispute' as const, subjectId: `PP-D-${rental.rentalId}`, allowed: ['respond_to_dispute' as const] }
  const run = await asWorker((transaction) => beginOpsRun(transaction, 'manual', now))
  const [recorded] = await asWorker((transaction) => recordExceptions(transaction, run, [{ ...exception, rentalId: rental.rentalId, reminder: null, deadline: null, moneyCents: 3500, fingerprint: `${exception.kind}:${exception.subjectId}:t` }], now))
  const written = await asWorker((transaction) => writeProposal(transaction, { exceptionId: recorded?.id ?? '', kind, reason: 'Reason.', references: [], draft, raisedByAgent: false, runId: run, model: null, promptVersion: null }, now))
  if (!written.written) throw new Error('No proposal')
  const decided = await shop.act((transaction) => decideProposal(transaction, written.id, shop.scope.userId ?? '', { decision: 'approve', reason: '' }, now))
  if (!decided.ok) throw new Error(decided.reason)
  return { proposalId: written.id, rentalId: rental.rentalId, disputeId: exception.subjectId }
}

const sent: { kind: string; to: string; text: string; key?: string }[] = []
const dependencies = (overrides: Partial<CarryOutDependencies> = {}): CarryOutDependencies => ({
  database,
  now: () => now,
  message: (input) => { sent.push({ kind: 'message', to: input.rentalId, text: input.text }); return Promise.resolve(true) },
  answerDispute: (_shopId, input) => { sent.push({ kind: 'dispute', to: input.disputeId, text: input.message, key: input.idempotencyKey }); return Promise.resolve(true) },
  ...overrides,
})
const stateOf = async (proposalId: string) => (await database.select().from(proposals).where(eq(proposals.id, proposalId)))[0]?.state

it('emails the renter the approved message, once, and marks it done', async () => {
  const { proposalId, rentalId } = await approved('send_message', 'Please call the shop about your hold.')
  expect(await carryOutProposal(dependencies(), { shopId: shop.scope.shopId, proposalId })).toBe('executed')
  expect(await carryOutProposal(dependencies(), { shopId: shop.scope.shopId, proposalId })).toBe('nothing_to_do')
  expect(sent.filter((each) => each.to === rentalId)).toEqual([{ kind: 'message', to: rentalId, text: 'Please call the shop about your hold.' }])
  expect(await stateOf(proposalId)).toBe('executed')
  const [line] = await database.select().from(auditLog).where(eq(auditLog.subjectId, proposalId))
  expect(line).toMatchObject({ action: 'proposal.executed', actorKind: 'system' })
})

it('answers PayPal on the dispute with the proposal as the idempotency key', async () => {
  const { proposalId, disputeId } = await approved('respond_to_dispute', 'The scratch is in the return photographs.')
  expect(await carryOutProposal(dependencies(), { shopId: shop.scope.shopId, proposalId })).toBe('executed')
  expect(sent.find((each) => each.to === disputeId)).toEqual({ kind: 'dispute', to: disputeId, text: 'The scratch is in the return photographs.', key: `proposal-${proposalId}` })
})

it('marks the proposal failed, and says so, when PayPal or the mail refuses it', async () => {
  const { proposalId } = await approved('respond_to_dispute', 'The scratch is in the return photographs.')
  expect(await carryOutProposal(dependencies({ answerDispute: () => Promise.resolve(false) }), { shopId: shop.scope.shopId, proposalId })).toBe('failed')
  expect(await stateOf(proposalId)).toBe('failed')
})
