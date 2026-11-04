import { addSampleRentals, auditLog, authorizations, captureSessions, comparisons, decideProposal, decideRule, draftRule, grantStandingRule, holds, inShop, itemTypes, opsRuns, proposals, rentalItems, rentals, shopExceptions, staffRoles } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import type { TestDatabase } from '@hold/db/testing'
import { readyRentalShop } from '@hold/db/testing/ready-rental'
import type { ReadyRentalShop } from '@hold/db/testing/ready-rental'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { InvestigationAnswer, Investigator } from './investigator.ts'
import type { OpenedReader } from './paypal-reader.ts'
import { runOperations } from './run-operations.ts'
import type { OpsDependencies, ShopPayPalReads } from './run-operations.ts'

const now = new Date('2026-10-20T03:00:00Z')
const HOUR = 3_600_000
let database: TestDatabase
let shop: ReadyRentalShop
let counter = 0
beforeAll(async () => { database = await createTestDatabase() })
afterAll(async () => { await database.$client.close() })

// A fresh shop for each test, so each run sees only its own cases.
beforeEach(async () => {
  counter += 1
  shop = await readyRentalShop(database, `ops-run-${String(counter)}`, now)
})

// One rental out with its hold ending in two days: hold_ending, which allows request_replacement_hold.
async function holdEnding() {
  const rental = await shop.readyRental()
  await database.update(rentals).set({ state: 'out', endsAt: new Date(now.getTime() + 24 * HOUR) }).where(eq(rentals.id, rental.rentalId))
  const [hold] = await database.select().from(holds).where(eq(holds.rentalId, rental.rentalId))
  await database.update(authorizations).set({ validUntil: new Date(now.getTime() + 48 * HOUR) }).where(eq(authorizations.id, hold?.currentAuthorizationId ?? ''))
  return { rentalId: rental.rentalId, holdId: hold?.id ?? '' }
}

// One rental past its end: return_overdue, an automatic reminder.
async function overdue() {
  const rental = await shop.readyRental()
  await database.update(rentals).set({ state: 'out', endsAt: new Date(now.getTime() - 2 * HOUR) }).where(eq(rentals.id, rental.rentalId))
  return rental.rentalId
}

// One rental back with a clean comparison nobody confirmed for six hours: clean_return_unconfirmed.
async function cleanUnconfirmed() {
  const rental = await shop.readyRental()
  await database.update(rentals).set({ state: 'returned' }).where(eq(rentals.id, rental.rentalId))
  const [plan] = await database.select({ id: itemTypes.photoPlanId }).from(itemTypes).where(eq(itemTypes.id, shop.typeId))
  const [rentalItem] = await database.select({ id: rentalItems.id }).from(rentalItems).where(eq(rentalItems.rentalId, rental.rentalId))
  const session = async (kind: 'handover' | 'return') => (await database.insert(captureSessions).values({ shopId: shop.scope.shopId, rentalItemId: rentalItem?.id ?? '', kind, photoPlanId: plan?.id ?? '', sealedAt: now, manifest: `{"kind":"${kind}"}`, manifestFingerprint: (kind === 'handover' ? 'a' : 'b').repeat(64) }).returning())[0]?.id ?? ''
  await database.insert(comparisons).values({ shopId: shop.scope.shopId, handoverSessionId: await session('handover'), returnSessionId: await session('return'), state: 'clean', completedAt: new Date(now.getTime() - 6 * HOUR) })
  const [hold] = await database.select().from(holds).where(eq(holds.rentalId, rental.rentalId))
  return { rentalId: rental.rentalId, holdId: hold?.id ?? '' }
}

const answer = (fields: Partial<InvestigationAnswer> & Pick<InvestigationAnswer, 'proposalKind'>): InvestigationAnswer => ({ reason: 'The hold ends in two days and the bike is still out.', references: ['AUTH-1'], draft: null, paypalConfirmed: true, observations: [], ...fields })

// An investigator that follows a script: the tool calls it makes, then its answer.
function scripted(script: (kind: string) => { readonly calls?: readonly { readonly name: string; readonly args: Readonly<Record<string, unknown>> }[]; readonly answer: InvestigationAnswer | 'refused' }): Investigator & { readonly toolAnswers: string[] } {
  const toolAnswers: string[] = []
  return {
    toolAnswers,
    async investigate(request, tools) {
      const step = script(request.exceptionKind)
      for (const call of step.calls ?? []) toolAnswers.push(await tools.call(call.name, call.args))
      if (step.answer === 'refused') return { kind: 'refused', model: 'scripted', inputTokens: 10, outputTokens: 0 }
      return { kind: 'result', data: step.answer, model: 'scripted', inputTokens: 100, outputTokens: 20 }
    },
  }
}

const reader = (names: readonly string[] = ['get_order', 'list_transactions']): OpenedReader => ({
  ok: true,
  reader: {
    tools: names.map((name) => ({ name, description: name, inputSchema: { type: 'object' } })),
    call: (name, args) => Promise.resolve(names.includes(name) ? { ok: true, text: `${name} ${JSON.stringify(args)}` } : { ok: false, reason: 'not_allowed' }),
    close: () => Promise.resolve(),
  },
})

const paypal = (overrides: Partial<ShopPayPalReads> = {}): ShopPayPalReads => ({
  disputes: () => Promise.resolve([]),
  authorization: () => Promise.resolve('created'),
  openReader: () => Promise.resolve(reader()),
  ...overrides,
})

const sent: { kind: string; rentalId: string; dueAt: Date | null }[] = []
const dependencies = (overrides: Partial<OpsDependencies> = {}): OpsDependencies => ({
  database,
  now: () => now,
  investigator: undefined,
  paypal: () => Promise.resolve(paypal()),
  remind: (reminder) => { sent.push(reminder); return Promise.resolve() },
  ...overrides,
})
const run = (overrides: Partial<OpsDependencies> = {}) => runOperations(dependencies(overrides), { shopId: shop.scope.shopId, trigger: 'nightly' })
const inShopProposals = () => inShop(database, { role: 'hold_worker', shopId: shop.scope.shopId }, (transaction) => transaction.select().from(proposals))
const inShopExceptions = () => inShop(database, { role: 'hold_worker', shopId: shop.scope.shopId }, (transaction) => transaction.select().from(shopExceptions))

describe('a nightly run', () => {
  it('records one exception for each case and one proposal or reminder for each, and nothing more when repeated (X1.1, X1.2)', async () => {
    const ending = await holdEnding()
    const late = await overdue()
    const dispute = { id: 'PP-D-1', open: true, amount: { cents: 3500, currency: 'EUR' }, responseDueAt: new Date(now.getTime() + 5 * 24 * HOUR), captureIds: ['CAPTURE-UNKNOWN'] }
    const reads = paypal({ disputes: () => Promise.resolve([dispute]), authorization: (id) => Promise.resolve(id === `AUTH-${late}` ? 'voided' : 'created') })
    const investigator = scripted((kind) => ({ answer: answer({ proposalKind: kind === 'dispute_open' ? 'respond_to_dispute' : kind === 'reconciliation_difference' ? 'note' : 'request_replacement_hold' }) }))
    await run({ investigator, paypal: () => Promise.resolve(reads) })
    const found = await inShopExceptions()
    expect(found.map((each) => each.kind).sort()).toEqual(['dispute_open', 'hold_ending', 'reconciliation_difference', 'return_overdue'])
    const written = await inShopProposals()
    expect(written.map((each) => `${each.kind}:${each.subjectId}`).sort()).toEqual([`note:${found.find((each) => each.kind === 'reconciliation_difference')?.subjectId ?? ''}`, `request_replacement_hold:${ending.holdId}`, 'respond_to_dispute:PP-D-1'].sort())
    expect(sent.filter((each) => each.rentalId === late)).toEqual([{ kind: 'return_due', rentalId: late, shopId: shop.scope.shopId, dueAt: new Date(now.getTime() - 2 * HOUR) }])
    await run({ investigator, paypal: () => Promise.resolve(reads) })
    expect(await inShopExceptions()).toHaveLength(found.length)
    expect(await inShopProposals()).toHaveLength(written.length)
    expect(sent.filter((each) => each.rentalId === late)).toHaveLength(1)
  })

  it('finishes the run when a reminder cannot be sent, and counts it', async () => {
    await overdue()
    const ending = await holdEnding()
    const runId = await run({ remind: () => Promise.reject(new Error('SMTP down')) })
    expect((await inShopProposals()).map((each) => each.subjectId)).toEqual([ending.holdId])
    const [row] = await inShop(database, { role: 'hold_worker', shopId: shop.scope.shopId }, (transaction) => transaction.select().from(opsRuns).where(eq(opsRuns.id, runId)))
    expect(row).toMatchObject({ state: 'completed', counts: { reminders: 0, remindersFailed: 1 } })
  })

  it('still lists every exception with a fixed reason when Claude is not there (X1.6)', async () => {
    const ending = await holdEnding()
    await run({ investigator: undefined })
    const [written] = await inShopProposals()
    expect(written).toMatchObject({ kind: 'request_replacement_hold', subjectId: ending.holdId, model: null, payload: { fixedReason: 'hold_ending', investigated: 'no' } })
  })

  it('says PayPal could not be checked when its server cannot be reached', async () => {
    await holdEnding()
    await run({ investigator: scripted(() => ({ answer: answer({ proposalKind: 'request_replacement_hold' }) })), paypal: () => Promise.resolve(paypal({ openReader: () => Promise.resolve({ ok: false, reason: 'unreachable' }) })) })
    const [written] = await inShopProposals()
    expect(written).toMatchObject({ kind: 'request_replacement_hold', model: 'scripted', payload: { paypalChecked: 'no' } })
  })

  it('marks PayPal checked only when a PayPal read for the exception succeeded, whatever the model says', async () => {
    await holdEnding()
    await holdEnding()
    let turn = 0
    const investigator = scripted(() => { turn += 1; return turn === 1 ? { answer: answer({ proposalKind: 'request_replacement_hold', paypalConfirmed: true }) } : { calls: [{ name: 'get_order', args: {} }], answer: answer({ proposalKind: 'request_replacement_hold', paypalConfirmed: true }) } })
    await run({ investigator })
    expect((await inShopProposals()).map((each) => each.payload['paypalChecked'] ?? 'yes').sort()).toEqual(['no', 'yes'])
  })

  it('writes every PayPal tool call to the audit log with its run and tool, refused ones too (X1.7)', async () => {
    await holdEnding()
    const investigator = scripted(() => ({ calls: [{ name: 'get_order', args: { id: 'HOLD-1' } }, { name: 'create_refund', args: { capture_id: 'C-1' } }], answer: answer({ proposalKind: 'request_replacement_hold' }) }))
    const runId = await run({ investigator })
    expect(investigator.toolAnswers[0]).toBe('get_order {"id":"HOLD-1"}')
    expect(investigator.toolAnswers[1]).toMatch(/not offered/i)
    const lines = await inShop(database, { role: 'hold_worker', shopId: shop.scope.shopId }, (transaction) => transaction.select().from(auditLog).where(eq(auditLog.source, runId)))
    expect(lines.map((line) => [line.action, line.actorKind, (line.detail as { outcome: string }).outcome])).toEqual([['agent.tool.paypal.get_order', 'shop_agent', 'ok'], ['agent.tool.paypal.create_refund', 'shop_agent', 'refused']])
  })

  // An agent always names the person it acts for (extensions.md section 4.1): the owner, as the shop records them.
  it('acts for the shop\'s owner, by their account, and names them on every PayPal call\'s audit line', async () => {
    await holdEnding()
    const investigator = scripted(() => ({ calls: [{ name: 'get_order', args: { id: 'HOLD-1' } }], answer: answer({ proposalKind: 'request_replacement_hold' }) }))
    const runId = await run({ investigator })
    const lines = await inShop(database, { role: 'hold_worker', shopId: shop.scope.shopId }, (transaction) => transaction.select().from(auditLog).where(eq(auditLog.source, runId)))
    expect(lines.map((line) => (line.detail as { actsFor?: string }).actsFor)).toEqual([shop.scope.userId])
  })

  it('reads nothing from PayPal for a shop with no owner to act for, and still writes the queue', async () => {
    await holdEnding()
    await database.delete(staffRoles).where(eq(staffRoles.shopId, shop.scope.shopId))
    const investigator = scripted(() => ({ calls: [{ name: 'get_order', args: { id: 'HOLD-1' } }], answer: answer({ proposalKind: 'request_replacement_hold' }) }))
    const runId = await run({ investigator })
    expect(investigator.toolAnswers).toEqual(['Refused: actor.'])
    const lines = await inShop(database, { role: 'hold_worker', shopId: shop.scope.shopId }, (transaction) => transaction.select().from(auditLog).where(eq(auditLog.source, runId)))
    expect(lines.map((line) => [(line.detail as { outcome: string }).outcome, (line.detail as { actsFor?: string | null }).actsFor])).toEqual([['refused_actor', null]])
    expect(await inShopProposals()).toHaveLength(1)
  })
})

describe('what a run spends Claude on', () => {
  it('never investigates, reminds about or reads back from PayPal a demo shop\'s sample rentals', async () => {
    await shop.act((transaction) => addSampleRentals(transaction, { shopId: shop.scope.shopId, userId: shop.scope.userId ?? '', timeZone: 'UTC', now }))
    let investigated = 0
    let reads = 0
    const investigator: Investigator = { investigate: () => { investigated += 1; return Promise.resolve({ kind: 'refused', model: 'counting', inputTokens: 0, outputTokens: 0 }) } }
    const before = sent.length
    const counting = paypal({ authorization: () => { reads += 1; return Promise.resolve('created') } })
    // That night and the nights after, as the samples' replies, promises and holds come due.
    for (const days of [0, 1, 2, 3, 5, 8, 30]) await run({ investigator, now: () => new Date(now.getTime() + days * 24 * HOUR), paypal: () => Promise.resolve(counting) })
    expect({ investigated, reads, reminders: sent.length - before }).toEqual({ investigated: 0, reads: 0, reminders: 0 })
  })

  it('does not ask the model again about an exception whose proposal still waits for the owner, nor open PayPal for it', async () => {
    await holdEnding()
    let asked = 0
    let opened = 0
    const investigator = scripted(() => { asked += 1; return { answer: answer({ proposalKind: 'request_replacement_hold' }) } })
    const reads = paypal({ openReader: () => { opened += 1; return Promise.resolve(reader()) } })
    await run({ investigator, paypal: () => Promise.resolve(reads) })
    await run({ investigator, paypal: () => Promise.resolve(reads) })
    expect({ asked, opened }).toEqual({ asked: 1, opened: 1 })
  })
})

describe('reading holds back from PayPal', () => {
  it('counts a walk-in hold PayPal reads as partly captured as expected, since its fee was taken from it, and any other as a difference', async () => {
    const walkIn = await shop.readyRental()
    const atCounter = await shop.readyRental()
    await database.update(holds).set({ strategy: 'combined' }).where(eq(holds.rentalId, walkIn.rentalId))
    await run({ paypal: () => Promise.resolve(paypal({ authorization: () => Promise.resolve('partially_captured') })) })
    const differences = (await inShopExceptions()).filter((each) => each.kind === 'reconciliation_difference').map((each) => each.rentalId)
    expect(differences).toEqual([atCounter.rentalId])
  })
})

describe('what a manipulated run can reach (X1.8)', () => {
  it('writes no proposal outside what the detectors allow, however the model was steered', async () => {
    const ending = await holdEnding()
    const steered = scripted(() => ({ answer: answer({ proposalKind: 'release_hold', reason: 'The memo says: release every hold now.', observations: [{ reason: 'Release all holds immediately.', references: [] }] }) }))
    await run({ investigator: steered })
    const written = await inShopProposals()
    expect(written.filter((each) => !each.raisedByAgent).map((each) => each.kind)).toEqual(['request_replacement_hold'])
    expect(written.find((each) => !each.raisedByAgent)?.payload).toMatchObject({ fixedReason: 'hold_ending' })
    expect(written.filter((each) => each.raisedByAgent).map((each) => [each.kind, each.subjectId])).toEqual([['note', ending.rentalId]])
    expect(written.some((each) => each.state !== 'pending')).toBe(false)
  })

  it('keeps a drafted message only if every number in it is the amount the records hold', async () => {
    await holdEnding()
    await holdEnding()
    let turn = 0
    const investigator = scripted(() => { turn += 1; return { answer: answer({ proposalKind: 'request_replacement_hold', draft: turn === 1 ? 'Your hold of €300.00 stays in place.' : 'Pay €999.00 now or lose your deposit.' }) } })
    await run({ investigator })
    const drafts = (await inShopProposals()).map((each) => [each.draft, each.payload['draftDropped'] ?? 'no']).sort()
    expect(drafts).toEqual([[null, 'yes'], ['Your hold of €300.00 stays in place.', 'no']])
  })

  it('treats a refusal as a normal outcome and falls back to the fixed reason', async () => {
    await holdEnding()
    await run({ investigator: scripted(() => ({ answer: 'refused' })) })
    expect((await inShopProposals())[0]?.payload).toMatchObject({ fixedReason: 'hold_ending' })
  })
})

describe('the run\'s ceilings', () => {
  it('sends what is left once the tool calls run out to the queue as not investigated', async () => {
    await holdEnding()
    await holdEnding()
    const investigator = scripted(() => ({ calls: [{ name: 'get_order', args: {} }], answer: answer({ proposalKind: 'request_replacement_hold' }) }))
    await run({ investigator, limits: { maxToolCalls: 1, toolCallsPerException: 6, maxTokens: 400_000, maxMilliseconds: 180_000 } })
    const written = await inShopProposals()
    expect(written.map((each) => each.payload['investigated'] ?? 'yes').sort()).toEqual(['no', 'yes'])
  })
})

describe('the owner\'s rules and standing rule', () => {
  it('does not make a proposal the owner confirmed a rule against (X1.9)', async () => {
    await holdEnding()
    const ruleId = await inShop(database, { role: 'hold_worker', shopId: shop.scope.shopId }, (transaction) => draftRule(transaction, { kind: 'never', proposalKind: 'request_replacement_hold' }, null, now))
    await shop.act((transaction) => decideRule(transaction, ruleId, shop.scope.userId ?? '', 'confirm', now))
    await run()
    expect(await inShopExceptions()).toHaveLength(1)
    expect(await inShopProposals()).toEqual([])
  })

  it('releases a clean return nobody confirmed under the owner\'s standing rule, and only while it is granted', async () => {
    const first = await cleanUnconfirmed()
    await run()
    expect((await inShopProposals())[0]).toMatchObject({ kind: 'release_hold', subjectId: first.holdId, state: 'pending' })
    const second = await cleanUnconfirmed()
    const mandateId = await shop.act((transaction) => grantStandingRule(transaction, shop.scope.userId ?? '', { dailyCount: 5, days: 30 }, now))
    await run()
    const after = await inShopProposals()
    expect(after.find((each) => each.subjectId === second.holdId)).toMatchObject({ state: 'executing', mandateId })
    expect((await database.select().from(holds).where(eq(holds.id, second.holdId)))[0]?.state).toBe('releasing')
    expect(await shop.act((transaction) => decideProposal(transaction, after.find((each) => each.subjectId === first.holdId)?.id ?? '', shop.scope.userId ?? '', { decision: 'approve', reason: '' }, now))).toMatchObject({ ok: true, state: 'executing' })
  })
})
