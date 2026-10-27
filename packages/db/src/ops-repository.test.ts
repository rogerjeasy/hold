import { detectExceptions } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditLog, authorizations, captureSessions, executions, holds, incidents, itemTypes, moneyEvents, outbox, proposals, rentalItems, rentals, shopExceptions } from './schema/index.ts'
import { auditAgentCall, beginOpsRun, finishProposal, proposalToCarryOut, completeOpsRun, decideProposal, exceptionFacts, holdsToReconcile, morningQueue, proposalAmount, queueOperationsCheck, recentDecisions, recordExceptions, rentalsForCaptures, shopSnapshot, writeProposal } from './ops-repository.ts'
import { grantStandingRule, revokeMandate } from './ops-settings-repository.ts'
import { outboxWrittenAt } from './paypal-event-repository.ts'
import { inShop } from './scope.ts'
import type { Transaction } from './scope.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'

const now = new Date('2026-10-20T12:00:00Z')
let database: TestDatabase
let shop: ReadyRentalShop
let other: ReadyRentalShop
beforeAll(async () => { database = await createTestDatabase(); shop = await readyRentalShop(database, 'ops', now); other = await readyRentalShop(database, 'ops-other', now) })
afterAll(async () => { await database.$client.close() })

// The operations agent runs in the worker, as hold_worker.
const asWorker = <Result>(work: (transaction: Transaction) => Promise<Result>) => inShop(database, { role: 'hold_worker', shopId: shop.scope.shopId }, work)

// A rental out with its hold ending within three days: the hold_ending detector's case.
async function holdEnding() {
  const rental = await shop.readyRental()
  await database.update(rentals).set({ state: 'out' }).where(eq(rentals.id, rental.rentalId))
  const [hold] = await database.select().from(holds).where(eq(holds.rentalId, rental.rentalId))
  await database.update(authorizations).set({ validUntil: new Date(now.getTime() + 48 * 3_600_000) }).where(eq(authorizations.id, hold?.currentAuthorizationId ?? ''))
  return { rentalId: rental.rentalId, holdId: hold?.id ?? '' }
}

describe('the operations agent\'s records', () => {
  it('reads the shop\'s records into what the detectors need', async () => {
    const { holdId } = await holdEnding()
    const snapshot = await shop.act((transaction) => shopSnapshot(transaction, now, { disputes: [], differences: [] }))
    expect(snapshot.holds.find((hold) => hold.id === holdId)).toMatchObject({ state: 'placed', reservedCents: 30000, replacementStarted: false })
    expect(detectExceptions(snapshot).some((each) => each.kind === 'hold_ending' && each.subjectId === holdId)).toBe(true)
  })

  it('reads an incident waiting for staff, since it was sorted, and no other', async () => {
    const rental = await shop.readyRental()
    const [rentalItem] = await database.select().from(rentalItems).where(eq(rentalItems.rentalId, rental.rentalId))
    const [type] = await database.select({ planId: itemTypes.photoPlanId }).from(itemTypes).where(eq(itemTypes.id, shop.typeId))
    const incident = async (state: 'awaiting_staff' | 'agreed', sortedAt: Date) => {
      const [session] = await database.insert(captureSessions).values({ shopId: shop.scope.shopId, rentalItemId: rentalItem?.id ?? '', kind: 'incident', photoPlanId: type?.planId ?? '' }).returning()
      const [row] = await database.insert(incidents).values({ shopId: shop.scope.shopId, rentalId: rental.rentalId, rentalItemId: rentalItem?.id ?? '', sessionId: session?.id ?? '', hint: 'damage', description: 'A scratch.', language: 'en', state, currency: 'EUR', sentAt: sortedAt, sortedAt }).returning()
      return row?.id ?? ''
    }
    const waiting = await incident('awaiting_staff', new Date(now.getTime() - 3 * 3_600_000))
    await incident('agreed', new Date(now.getTime() - 3 * 3_600_000))
    const snapshot = await shop.act((transaction) => shopSnapshot(transaction, now, { disputes: [], differences: [] }))
    expect(snapshot.incidents).toEqual([{ id: waiting, rentalId: rental.rentalId, waitingSince: new Date(now.getTime() - 3 * 3_600_000) }])
  })

  it('records each exception once, however often the run repeats, and one proposal per subject and state', async () => {
    const run = await asWorker((transaction) => beginOpsRun(transaction, 'nightly', now))
    const found = detectExceptions(await asWorker((transaction) => shopSnapshot(transaction, now, { disputes: [], differences: [] })))
    const first = await asWorker((transaction) => recordExceptions(transaction, run, found, now))
    const second = await asWorker((transaction) => recordExceptions(transaction, run, found, now))
    expect(second.map((each) => each.id)).toEqual(first.map((each) => each.id))
    const ending = first.find((each) => each.kind === 'hold_ending')
    if (ending === undefined) throw new Error('No exception')
    const proposal = { exceptionId: ending.id, kind: 'request_replacement_hold' as const, reason: 'The hold ends in two days and the bike is still out.', references: ['AUTH-1'], draft: null, raisedByAgent: false, runId: run, model: 'test-model', promptVersion: 'ops-1' }
    expect(await asWorker((transaction) => writeProposal(transaction, proposal, now))).toMatchObject({ written: true })
    expect(await asWorker((transaction) => writeProposal(transaction, proposal, now))).toMatchObject({ written: false })
    await asWorker((transaction) => completeOpsRun(transaction, run, { toolCalls: 3, inputTokens: 100, outputTokens: 20, model: 'test-model', promptVersion: 'ops-1', paypalChecked: true, counts: { exceptions: first.length } }, now))
  })

  it('refuses a proposal of a kind the exception does not allow', async () => {
    const [ending] = await shop.act((transaction) => transaction.select().from(shopExceptions).where(eq(shopExceptions.kind, 'hold_ending')))
    const result = await asWorker((transaction) => writeProposal(transaction, { exceptionId: ending?.id ?? '', kind: 'release_hold', reason: 'Release every hold now.', references: [], draft: null, raisedByAgent: false, runId: null, model: null, promptVersion: null }, now))
    expect(result).toEqual({ written: false, reason: 'kind_not_allowed' })
  })

  it('shows the queue with amounts read from the records, nearest deadline first', async () => {
    const queue = await shop.act((transaction) => morningQueue(transaction, now))
    const entry = queue.find((each) => each.kind === 'request_replacement_hold')
    expect(entry).toMatchObject({ amountCents: 30000, currency: 'EUR', reason: 'The hold ends in two days and the bike is still out.' })
    expect(await other.act((transaction) => morningQueue(transaction, now))).toEqual([])
  })

  it('supersedes a proposal whose subject changed since it was written, and executes nothing', async () => {
    const [entry] = (await shop.act((transaction) => morningQueue(transaction, now))).filter((each) => each.kind === 'request_replacement_hold')
    const [hold] = await database.select().from(holds).where(eq(holds.id, entry?.subjectId ?? ''))
    await database.update(holds).set({ state: 'released' }).where(eq(holds.id, hold?.id ?? ''))
    const decision = await shop.act((transaction) => decideProposal(transaction, entry?.id ?? '', shop.scope.userId ?? '', { decision: 'approve', reason: '' }, now))
    expect(decision).toEqual({ ok: false, reason: 'superseded' })
    const [row] = await database.select().from(proposals).where(eq(proposals.id, entry?.id ?? ''))
    expect(row?.state).toBe('superseded')
  })
})

// An exception recorded as a run would record it, and one pending proposal for it.
async function proposalFor(kind: 'clean_return_unconfirmed' | 'hold_ending' | 'hold_at_risk', subjectId: string, rentalId: string, proposalKind: 'release_hold' | 'request_replacement_hold' | 'send_invoice' | 'send_message') {
  const run = await asWorker((transaction) => beginOpsRun(transaction, 'manual', now))
  const [recorded] = await asWorker((transaction) => recordExceptions(transaction, run, [{ kind, subjectKind: 'hold', subjectId, rentalId, allowed: [proposalKind], reminder: null, deadline: null, moneyCents: 30000, fingerprint: `${kind}:${subjectId}:test` }], now))
  const written = await asWorker((transaction) => writeProposal(transaction, { exceptionId: recorded?.id ?? '', kind: proposalKind, reason: 'Clean comparison, nobody confirmed it.', references: ['AUTH-1'], draft: null, raisedByAgent: false, runId: run, model: null, promptVersion: null }, now))
  if (!written.written) throw new Error('No proposal')
  return written.id
}

describe('an approved proposal is carried out by the same path as a click', () => {
  it('releases a clean return\'s hold through the return release, and is executed once PayPal confirms it', async () => {
    const rental = await shop.readyRental()
    await database.update(rentals).set({ state: 'returned' }).where(eq(rentals.id, rental.rentalId))
    const [hold] = await database.select().from(holds).where(eq(holds.rentalId, rental.rentalId))
    const proposalId = await proposalFor('clean_return_unconfirmed', hold?.id ?? '', rental.rentalId, 'release_hold')
    const decision = await shop.act((transaction) => decideProposal(transaction, proposalId, shop.scope.userId ?? '', { decision: 'approve', reason: '' }, now))
    expect(decision).toMatchObject({ ok: true, state: 'executing' })
    const [execution] = await database.select().from(executions).where(eq(executions.idempotencyKey, `return-release-${hold?.id ?? ''}`))
    expect(execution).toMatchObject({ action: 'release', amountCents: 30000 })
    expect((await database.select().from(holds).where(eq(holds.id, hold?.id ?? '')))[0]?.state).toBe('releasing')
    expect((await database.select().from(proposals).where(eq(proposals.id, proposalId)))[0]).toMatchObject({ state: 'executing', executionId: execution?.id })
    await asWorker((transaction) => transaction.update(executions).set({ state: 'confirmed' }).where(eq(executions.id, execution?.id ?? '')))
    expect((await database.select().from(proposals).where(eq(proposals.id, proposalId)))[0]?.state).toBe('executed')
  })

  it('leaves the proposal pending and says why when the spine refuses it', async () => {
    const rental = await shop.readyRental()
    await database.update(rentals).set({ state: 'out' }).where(eq(rentals.id, rental.rentalId))
    const [hold] = await database.select().from(holds).where(eq(holds.rentalId, rental.rentalId))
    const proposalId = await proposalFor('clean_return_unconfirmed', hold?.id ?? '', rental.rentalId, 'release_hold')
    expect(await shop.act((transaction) => decideProposal(transaction, proposalId, shop.scope.userId ?? '', { decision: 'approve', reason: '' }, now))).toEqual({ ok: false, reason: 'not_returned' })
    expect((await database.select().from(proposals).where(eq(proposals.id, proposalId)))[0]?.state).toBe('pending')
  })

  it('acts under the owner\'s standing rule only while it is live, within its daily count, and never for a person', async () => {
    const returnedHold = async () => {
      const rental = await shop.readyRental()
      await database.update(rentals).set({ state: 'returned' }).where(eq(rentals.id, rental.rentalId))
      const [hold] = await database.select().from(holds).where(eq(holds.rentalId, rental.rentalId))
      return proposalFor('clean_return_unconfirmed', hold?.id ?? '', rental.rentalId, 'release_hold')
    }
    const mandateId = await shop.act((transaction) => grantStandingRule(transaction, shop.scope.userId ?? '', { dailyCount: 1, days: 30 }, now))
    const first = await returnedHold()
    const second = await returnedHold()
    expect(await shop.act((transaction) => decideProposal(transaction, first, shop.scope.userId ?? '', { decision: 'approve', reason: '', mandateId }, now))).toEqual({ ok: false, reason: 'mandate' })
    expect(await asWorker((transaction) => decideProposal(transaction, first, null, { decision: 'approve', reason: '', mandateId: '00000000-0000-4000-8000-000000000000' }, now))).toEqual({ ok: false, reason: 'mandate' })
    expect(await asWorker((transaction) => decideProposal(transaction, first, null, { decision: 'approve', reason: '', mandateId }, now))).toMatchObject({ ok: true, state: 'executing' })
    expect(await asWorker((transaction) => decideProposal(transaction, second, null, { decision: 'approve', reason: '', mandateId }, now))).toEqual({ ok: false, reason: 'daily_count_reached' })
    await shop.act((transaction) => revokeMandate(transaction, mandateId, now))
    expect(await asWorker((transaction) => decideProposal(transaction, second, null, { decision: 'approve', reason: '', mandateId }, new Date(now.getTime() + 86_400_000)))).toEqual({ ok: false, reason: 'revoked' })
    expect(await other.act((transaction) => decideProposal(transaction, second, null, { decision: 'approve', reason: '', mandateId }, now))).toEqual({ ok: false, reason: 'not_found' })
  })

  it('takes no approval from nobody', async () => {
    const proposalId = await proposalFor('hold_ending', (await holdEnding()).holdId, (await shop.readyRental()).rentalId, 'request_replacement_hold')
    expect(await asWorker((transaction) => decideProposal(transaction, proposalId, null, { decision: 'approve', reason: '' }, now))).toEqual({ ok: false, reason: 'mandate' })
  })

  it('hands an approved message with its draft to the operations worker, and refuses one with no draft', async () => {
    const rental = await shop.readyRental()
    const [hold] = await database.select().from(holds).where(eq(holds.rentalId, rental.rentalId))
    const bare = await proposalFor('hold_at_risk', hold?.id ?? '', rental.rentalId, 'send_message')
    expect(await shop.act((transaction) => decideProposal(transaction, bare, shop.scope.userId ?? '', { decision: 'approve', reason: '' }, now))).toEqual({ ok: false, reason: 'draft_required' })
    await database.update(proposals).set({ draft: 'Please call the shop about your hold.' }).where(eq(proposals.id, bare))
    expect(await shop.act((transaction) => decideProposal(transaction, bare, shop.scope.userId ?? '', { decision: 'approve', reason: '' }, now))).toMatchObject({ ok: true, state: 'executing' })
    expect((await database.select().from(outbox).where(eq(outbox.queue, 'ops-execute'))).map((each) => each.payload)).toContainEqual({ proposalId: bare })
    expect(await asWorker((transaction) => proposalToCarryOut(transaction, bare))).toMatchObject({ kind: 'send_message', draft: 'Please call the shop about your hold.', rentalId: rental.rentalId })
    await asWorker((transaction) => finishProposal(transaction, bare, 'executed', now))
    expect((await database.select().from(proposals).where(eq(proposals.id, bare)))[0]?.state).toBe('executed')
    expect(await asWorker((transaction) => proposalToCarryOut(transaction, bare))).toBeUndefined()
  })

  it('still refuses an invoice proposal, which the spine invoices itself', async () => {
    const rental = await shop.readyRental()
    const [hold] = await database.select().from(holds).where(eq(holds.rentalId, rental.rentalId))
    const proposalId = await proposalFor('hold_at_risk', hold?.id ?? '', rental.rentalId, 'send_invoice')
    expect(await shop.act((transaction) => decideProposal(transaction, proposalId, shop.scope.userId ?? '', { decision: 'approve', reason: '' }, now))).toEqual({ ok: false, reason: 'not_offered' })
  })

  it('asks the renter for a replacement hold through the hold\'s upkeep', async () => {
    const { rentalId, holdId } = await holdEnding()
    const proposalId = await proposalFor('hold_ending', holdId, rentalId, 'request_replacement_hold')
    expect(await shop.act((transaction) => decideProposal(transaction, proposalId, shop.scope.userId ?? '', { decision: 'approve', reason: '' }, now))).toMatchObject({ ok: true, state: 'executed' })
    const [hold] = await database.select().from(holds).where(eq(holds.id, holdId))
    const sent = await database.select().from(outbox).where(eq(outbox.queue, 'upkeep'))
    expect(sent.map((each) => each.payload)).toContainEqual({ kind: 'replace', holdId, authorizationId: hold?.currentAuthorizationId })
  })
})

describe('what the owner\'s screen reads and asks for', () => {
  it('carries the marks for the screen on each queue entry', async () => {
    const { rentalId, holdId } = await holdEnding()
    const run = await asWorker((transaction) => beginOpsRun(transaction, 'manual', now))
    const [recorded] = await asWorker((transaction) => recordExceptions(transaction, run, [{ kind: 'hold_ending', subjectKind: 'hold', subjectId: holdId, rentalId, allowed: ['request_replacement_hold'], reminder: null, deadline: null, moneyCents: 30000, fingerprint: `hold_ending:${holdId}:marks` }], now))
    const payload = { fixedReason: 'hold_ending', investigated: 'no', paypalChecked: 'no' }
    const written = await asWorker((transaction) => writeProposal(transaction, { exceptionId: recorded?.id ?? '', kind: 'request_replacement_hold', reason: 'The hold ends within three days and the rental is still open.', references: [], draft: null, raisedByAgent: false, runId: run, model: null, promptVersion: null, payload }, now))
    const entry = (await shop.act((transaction) => morningQueue(transaction, now))).find((each) => written.written && each.id === written.id)
    expect(entry?.payload).toEqual(payload)
  })

  it('reads a decided proposal\'s amount from the records it names, for the rule drafted from it, and nothing across shops', async () => {
    const { rentalId, holdId } = await holdEnding()
    const proposalId = await proposalFor('hold_ending', holdId, rentalId, 'request_replacement_hold')
    await shop.act((transaction) => decideProposal(transaction, proposalId, shop.scope.userId ?? '', { decision: 'reject', reason: 'This renter always returns early.' }, now))
    expect(await shop.act((transaction) => proposalAmount(transaction, proposalId))).toEqual({ amountCents: 30000, currency: 'EUR' })
    expect(await other.act((transaction) => proposalAmount(transaction, proposalId))).toEqual({ amountCents: null, currency: null })
  })

  it('lists what was decided in the last day and what was put off, each with its outcome', async () => {
    const { rentalId, holdId } = await holdEnding()
    const rejected = await proposalFor('hold_ending', holdId, rentalId, 'request_replacement_hold')
    await shop.act((transaction) => decideProposal(transaction, rejected, shop.scope.userId ?? '', { decision: 'reject', reason: 'Not this one.' }, now))
    const later = await holdEnding()
    const postponed = await proposalFor('hold_ending', later.holdId, later.rentalId, 'request_replacement_hold')
    await shop.act((transaction) => decideProposal(transaction, postponed, shop.scope.userId ?? '', { decision: 'postpone', reason: '' }, now))
    const recent = await shop.act((transaction) => recentDecisions(transaction, now))
    expect(recent).toContainEqual(expect.objectContaining({ id: rejected, kind: 'request_replacement_hold', state: 'rejected', decisionReason: 'Not this one.' }))
    expect(recent).toContainEqual(expect.objectContaining({ id: postponed, state: 'pending', postponedUntil: new Date(now.getTime() + 86_400_000) }))
    expect(await shop.act((transaction) => recentDecisions(transaction, new Date(now.getTime() + 3 * 86_400_000)))).toEqual([])
    expect(await other.act((transaction) => recentDecisions(transaction, now))).toEqual([])
  })

  it('asks for a manual run through the outbox, ordered per shop', async () => {
    const outboxId = await shop.act((transaction) => queueOperationsCheck(transaction, now))
    const [row] = await database.select().from(outbox).where(eq(outbox.id, outboxId))
    expect(row).toMatchObject({ shopId: shop.scope.shopId, queue: 'ops-agent', messageGroup: shop.scope.shopId, payload: { trigger: 'manual' } })
    expect(await shop.act((transaction) => outboxWrittenAt(transaction, now))).toContainEqual({ id: outboxId, shopId: shop.scope.shopId, queue: 'ops-agent', messageGroup: shop.scope.shopId, payload: { trigger: 'manual' } })
    expect(await other.act((transaction) => outboxWrittenAt(transaction, now))).toEqual([])
    expect(await shop.act((transaction) => outboxWrittenAt(transaction, new Date(now.getTime() + 1)))).toEqual([])
  })
})

describe('what the operations run reads', () => {
  it('lists the holds to check against PayPal, finds a dispute\'s rental by its capture, and audits each agent call', async () => {
    const { rentalId, holdId } = await holdEnding()
    const holdsToCheck = await asWorker((transaction) => holdsToReconcile(transaction))
    expect(holdsToCheck).toContainEqual(expect.objectContaining({ holdId, rentalId, state: 'placed' }))
    await database.insert(moneyEvents).values({ shopId: shop.scope.shopId, rentalId, holdId, kind: 'hold_captured', currency: 'EUR', amountCents: 3500, paypalReference: 'CAPTURE-DISPUTED', occurredAt: now })
    expect(await asWorker((transaction) => rentalsForCaptures(transaction, ['CAPTURE-DISPUTED', 'CAPTURE-UNKNOWN']))).toEqual({ 'CAPTURE-DISPUTED': rentalId })
    await asWorker((transaction) => auditAgentCall(transaction, { runId: null, tool: 'paypal.list_transactions', subjectKind: 'hold', subjectId: holdId, outcome: 'ok', milliseconds: 12 }, now))
    const [line] = await database.select().from(auditLog).where(eq(auditLog.action, 'agent.tool.paypal.list_transactions'))
    expect(line).toMatchObject({ actorKind: 'shop_agent', shopId: shop.scope.shopId, detail: { outcome: 'ok', milliseconds: 12 } })
  })

  it('gives an investigation the records an exception names, with no name or address in them', async () => {
    const { holdId } = await holdEnding()
    const facts = await asWorker((transaction) => exceptionFacts(transaction, 'hold', holdId))
    expect(facts).toMatchObject({ hold: { state: 'placed', reservedCents: 30000 }, rental: { state: 'out' } })
    expect(JSON.stringify(facts)).not.toMatch(/priya|example\.com/i)
  })
})
