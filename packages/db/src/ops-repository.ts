import { createHash } from 'node:crypto'
import { DETECTOR_PROPOSALS, orderQueue, proposalFingerprintInput, withinMandate } from '@hold/domain'
import type { ProposalKind, ShopException, ShopSnapshot } from '@hold/domain'
import { and, desc, eq, gt, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { approvals, auditLog, authorizations, captureSessions, claims, comparisons, holds, incidents, invoices, moneyEvents, opsRuns, outbox, proposals, rentalItems, rentals, shopExceptions, shops } from './schema/index.ts'
import { releaseCleanReturn } from './claim-repository.ts'
import { mandateForUse } from './ops-settings-repository.ts'
import { outsideShop } from './scope.ts'
import type { Database, Transaction } from './scope.ts'

export const OPS_EXECUTE_QUEUE = 'ops-execute'
export const OPS_AGENT_QUEUE = 'ops-agent'

const DEFAULT_SETTINGS = { confirmCleanWithinHours: 4, invoiceUnpaidDays: 7, incidentWaitHours: 2 } as const

// What the detectors read: the shop's own records, with what code read from PayPal beside them. A sample rental's
// records are left out with the rental: its renter and its PayPal references were made up for the demonstration, so
// nothing about it is worth a reminder, a PayPal read or the model's tokens.
export async function shopSnapshot(transaction: Transaction, now: Date, fromPayPal: Pick<ShopSnapshot, 'disputes' | 'differences'>): Promise<ShopSnapshot> {
  const [shop] = await transaction.select({ opsSettings: shops.opsSettings }).from(shops).limit(1)
  const real = eq(rentals.simulated, false)
  const rentalRows = await transaction.select({ id: rentals.id, state: rentals.state, endsAt: rentals.endsAt, renterId: rentals.renterId }).from(rentals).where(real)
  const holdRows = await transaction.select({ id: holds.id, rentalId: holds.rentalId, state: holds.state, reservedCents: holds.reservedCents, currency: holds.currency, validUntil: authorizations.validUntil, stateChangedAt: holds.stateChangedAt, replacementOrderId: holds.replacementOrderId })
    .from(holds).innerJoin(rentals, eq(rentals.id, holds.rentalId)).leftJoin(authorizations, eq(authorizations.id, holds.currentAuthorizationId)).where(real)
  const comparisonRows = await transaction.select({ rentalId: rentalItems.rentalId, state: comparisons.state, completedAt: comparisons.completedAt, simulated: comparisons.simulated })
    .from(comparisons).innerJoin(captureSessions, eq(captureSessions.id, comparisons.returnSessionId)).innerJoin(rentalItems, eq(rentalItems.id, captureSessions.rentalItemId)).innerJoin(rentals, eq(rentals.id, rentalItems.rentalId)).where(real)
  const claimRows = await transaction.select({ id: claims.id, rentalId: claims.rentalId, state: claims.state, totalCents: claims.totalCents, currency: claims.currency, replyDueAt: claims.replyDueAt, decideBy: claims.decideBy, decidedAt: claims.decidedAt, promiseMissedAt: claims.promiseMissedAt })
    .from(claims).innerJoin(rentals, eq(rentals.id, claims.rentalId)).where(real)
  const invoiceRows = await transaction.select({ id: invoices.id, claimId: invoices.claimId, rentalId: invoices.rentalId, state: invoices.state, amountCents: invoices.amountCents, sentAt: invoices.sentAt })
    .from(invoices).innerJoin(rentals, eq(rentals.id, invoices.rentalId)).where(real)
  // An incident waits for staff from when it was sorted to them (extensions.md section 10).
  const incidentRows = await transaction.select({ id: incidents.id, rentalId: incidents.rentalId, waitingSince: sql<Date | null>`coalesce(${incidents.sortedAt}, ${incidents.sentAt})`.mapWith(incidents.sortedAt) })
    .from(incidents).where(and(eq(incidents.state, 'awaiting_staff'), eq(incidents.simulated, false)))
  return {
    now,
    settings: { ...DEFAULT_SETTINGS, ...shop?.opsSettings },
    rentals: rentalRows,
    holds: holdRows.map(({ replacementOrderId, ...hold }) => ({ ...hold, replacementStarted: replacementOrderId !== null })),
    comparisons: comparisonRows,
    claims: claimRows.map(({ decideBy, decidedAt, promiseMissedAt, ...claim }) => ({ ...claim, promise: { decideBy, decidedAt, promiseMissedAt } })),
    invoices: invoiceRows,
    incidents: incidentRows,
    ...fromPayPal,
  }
}

export async function beginOpsRun(transaction: Transaction, trigger: typeof opsRuns.$inferInsert['trigger'], now: Date): Promise<string> {
  const [shop] = await transaction.select({ id: shops.id }).from(shops).limit(1)
  if (shop === undefined) throw new Error('No shop in scope.')
  const [run] = await transaction.insert(opsRuns).values({ shopId: shop.id, trigger, startedAt: now }).returning({ id: opsRuns.id })
  if (run === undefined) throw new Error('The run was not recorded.')
  return run.id
}

export type RunUsage = { readonly toolCalls: number; readonly inputTokens: number; readonly outputTokens: number; readonly model: string | null; readonly promptVersion: string | null; readonly paypalChecked: boolean; readonly counts: Readonly<Record<string, number>> }

export async function completeOpsRun(transaction: Transaction, runId: string, usage: RunUsage, now: Date): Promise<void> {
  await transaction.update(opsRuns).set({ ...usage, state: 'completed', completedAt: now }).where(eq(opsRuns.id, runId))
}

export type RecordedException = ShopException & { readonly id: string }

// Writes each exception once, keyed by its fingerprint, and marks resolved those the detectors no longer see.
export async function recordExceptions(transaction: Transaction, runId: string, found: readonly ShopException[], now: Date): Promise<RecordedException[]> {
  const [shop] = await transaction.select({ id: shops.id }).from(shops).limit(1)
  if (shop === undefined) throw new Error('No shop in scope.')
  const recorded: RecordedException[] = []
  for (const exception of found) {
    await transaction.insert(shopExceptions).values({ shopId: shop.id, kind: exception.kind, subjectKind: exception.subjectKind, subjectId: exception.subjectId, rentalId: exception.rentalId, fingerprint: exception.fingerprint, deadline: exception.deadline, moneyCents: exception.moneyCents, detectedAt: now, lastRunId: runId }).onConflictDoNothing()
    const [row] = await transaction.select({ id: shopExceptions.id }).from(shopExceptions).where(eq(shopExceptions.fingerprint, exception.fingerprint))
    if (row !== undefined) recorded.push({ ...exception, id: row.id })
  }
  const seen = found.map((exception) => exception.fingerprint)
  await transaction.update(shopExceptions).set({ resolvedAt: now }).where(and(isNull(shopExceptions.resolvedAt), seen.length === 0 ? sql`true` : sql`${shopExceptions.fingerprint} not in (${sql.join(seen.map((each) => sql`${each}`), sql`, `)})`))
  return recorded
}

// The state a proposal is written against, read from the records it names. At approval it is read again.
async function subjectFingerprint(transaction: Transaction, subjectKind: string, subjectId: string): Promise<string> {
  let state: Record<string, string | number | null> = { subjectKind, subjectId }
  if (subjectKind === 'hold') {
    const [hold] = await transaction.select({ state: holds.state, authorization: holds.currentAuthorizationId, reserved: holds.reservedCents }).from(holds).where(eq(holds.id, subjectId))
    state = { ...state, ...hold }
  } else if (subjectKind === 'claim') {
    const [claim] = await transaction.select({ state: claims.state, total: claims.totalCents }).from(claims).where(eq(claims.id, subjectId))
    state = { ...state, ...claim }
  } else if (subjectKind === 'rental') {
    const [rental] = await transaction.select({ state: rentals.state }).from(rentals).where(eq(rentals.id, subjectId))
    state = { ...state, ...rental }
  } else if (subjectKind === 'invoice') {
    const [bill] = await transaction.select({ state: invoices.state }).from(invoices).where(eq(invoices.id, subjectId))
    state = { ...state, ...bill }
  }
  return createHash('sha256').update(proposalFingerprintInput(state)).digest('hex')
}

export type ProposalInput = {
  readonly exceptionId: string | null
  readonly kind: ProposalKind
  readonly reason: string
  readonly references: readonly string[]
  readonly draft: string | null
  // An observation no detector raised. It may only be a note.
  readonly raisedByAgent: boolean
  readonly runId: string | null
  readonly model: string | null
  readonly promptVersion: string | null
  readonly subject?: { readonly kind: string; readonly id: string; readonly rentalId: string | null }
  // Marks for the screen, such as which fixed reason the entry carries and whether PayPal was checked.
  readonly payload?: Readonly<Record<string, string>>
}

export type WriteResult = { readonly written: true; readonly id: string } | { readonly written: false; readonly reason?: 'kind_not_allowed' | 'no_exception' }

// Writes a proposal of a kind its exception allows, against the state its subject is in now. A repeated run with the
// same subject in the same state writes nothing.
export async function writeProposal(transaction: Transaction, input: ProposalInput, now: Date): Promise<WriteResult> {
  let subject = input.subject
  if (input.exceptionId !== null) {
    const [exception] = await transaction.select().from(shopExceptions).where(eq(shopExceptions.id, input.exceptionId))
    if (exception === undefined) return { written: false, reason: 'no_exception' }
    if (!DETECTOR_PROPOSALS[exception.kind].includes(input.kind)) return { written: false, reason: 'kind_not_allowed' }
    subject = { kind: exception.subjectKind, id: exception.subjectId, rentalId: exception.rentalId }
  } else if (!input.raisedByAgent || input.kind !== 'note') {
    return { written: false, reason: 'kind_not_allowed' }
  }
  if (subject === undefined) return { written: false, reason: 'no_exception' }
  const [shop] = await transaction.select({ id: shops.id }).from(shops).limit(1)
  if (shop === undefined) throw new Error('No shop in scope.')
  const [row] = await transaction.insert(proposals).values({
    shopId: shop.id, kind: input.kind, subjectKind: subject.kind, subjectId: subject.id, rentalId: subject.rentalId, exceptionId: input.exceptionId,
    reason: input.reason, references: [...input.references], draft: input.draft, payload: { ...input.payload }, preconditionFingerprint: await subjectFingerprint(transaction, subject.kind, subject.id),
    raisedByAgent: input.raisedByAgent, runId: input.runId, model: input.model, promptVersion: input.promptVersion, createdAt: now, updatedAt: now,
  }).onConflictDoNothing().returning({ id: proposals.id })
  return row === undefined ? { written: false } : { written: true, id: row.id }
}

export type QueueEntry = {
  readonly id: string
  readonly kind: ProposalKind
  readonly subjectKind: string
  readonly subjectId: string
  readonly rentalId: string | null
  readonly reason: string
  readonly references: readonly string[]
  readonly draft: string | null
  readonly raisedByAgent: boolean
  // The model whose answer the entry carries; null when it carries the detector's fixed reason.
  readonly model: string | null
  readonly deadline: Date | null
  readonly exceptionKind: string | null
  // Read from the records the proposal names, now; never from the proposal or the model.
  readonly amountCents: number | null
  readonly currency: string | null
  readonly moneyCents: number
  // Marks for the screen: the fixed reason's detector, and whether the entry was investigated and checked with PayPal.
  readonly payload: Readonly<Record<string, string>>
}

// What a proposal's amount is read from: what it is about, and the rental it concerns.
type AmountSubject = { readonly kind: ProposalKind; readonly subjectKind: string; readonly subjectId: string; readonly rentalId: string | null }
type Amount = { readonly amountCents: number | null; readonly currency: string | null }
type AmountFacts = {
  readonly holds: ReadonlyMap<string, { readonly reservedCents: number; readonly currency: string }>
  readonly claimsById: ReadonlyMap<string, { readonly totalCents: number; readonly currency: string }>
  readonly claimsByRental: ReadonlyMap<string, { readonly totalCents: number; readonly currency: string }>
  readonly captured: ReadonlyMap<string, number>
}

const NO_AMOUNT: Amount = { amountCents: null, currency: null }
const namesNoAmount = (subject: AmountSubject) => subject.kind === 'note' || subject.kind === 'send_message' || subject.rentalId === null
const namesHold = (subject: AmountSubject) => subject.kind === 'release_hold' || subject.kind === 'request_replacement_hold'

// The holds, claims and captures the given proposals' amounts are read from: at most three reads however many there
// are, each skipped when no proposal needs it.
async function amountFacts(transaction: Transaction, subjects: readonly AmountSubject[]): Promise<AmountFacts> {
  const priced = subjects.filter((subject) => !namesNoAmount(subject))
  const holdRentals = [...new Set(priced.filter(namesHold).flatMap((subject) => (subject.rentalId === null ? [] : [subject.rentalId])))]
  const claimed = priced.filter((subject) => !namesHold(subject))
  const claimIds = [...new Set(claimed.filter((subject) => subject.subjectKind === 'claim').map((subject) => subject.subjectId))]
  const claimRentals = [...new Set(claimed.filter((subject) => subject.subjectKind !== 'claim').flatMap((subject) => (subject.rentalId === null ? [] : [subject.rentalId])))]
  const heldRows = holdRentals.length === 0 ? [] : await transaction.select({ rentalId: holds.rentalId, reservedCents: holds.reservedCents, currency: holds.currency }).from(holds).where(inArray(holds.rentalId, holdRentals))
  const claimRows = claimIds.length === 0 && claimRentals.length === 0 ? [] : await transaction.select({ id: claims.id, rentalId: claims.rentalId, totalCents: claims.totalCents, currency: claims.currency }).from(claims)
    .where(or(...(claimIds.length === 0 ? [] : [inArray(claims.id, claimIds)]), ...(claimRentals.length === 0 ? [] : [inArray(claims.rentalId, claimRentals)])))
  const capturedRentals = [...new Set(claimed.flatMap((subject) => (subject.rentalId === null ? [] : [subject.rentalId])))]
  const capturedRows = claimRows.length === 0 || capturedRentals.length === 0 ? [] : await transaction
    .select({ rentalId: moneyEvents.rentalId, amountCents: sql<number>`coalesce(sum(${moneyEvents.amountCents}), 0)::bigint`.mapWith(Number) })
    .from(moneyEvents).where(and(inArray(moneyEvents.rentalId, capturedRentals), eq(moneyEvents.kind, 'hold_captured'))).groupBy(moneyEvents.rentalId)
  return {
    holds: new Map(heldRows.map((row) => [row.rentalId, row])),
    claimsById: new Map(claimRows.map((row) => [row.id, row])),
    claimsByRental: new Map(claimRows.map((row) => [row.rentalId, row])),
    captured: new Map(capturedRows.map((row) => [row.rentalId, row.amountCents])),
  }
}

// The amount approving a proposal would act on, from records read at this moment (X1.10).
function amountOf(subject: AmountSubject, facts: AmountFacts): Amount {
  if (namesNoAmount(subject) || subject.rentalId === null) return NO_AMOUNT
  if (namesHold(subject)) {
    const hold = facts.holds.get(subject.rentalId)
    return hold === undefined ? NO_AMOUNT : { amountCents: hold.reservedCents, currency: hold.currency }
  }
  const claim = subject.subjectKind === 'claim' ? facts.claimsById.get(subject.subjectId) : facts.claimsByRental.get(subject.rentalId)
  if (claim === undefined) return NO_AMOUNT
  const captured = facts.captured.get(subject.rentalId) ?? 0
  // An answer to a dispute is about the money the renter disputes, which is what was captured.
  if (subject.kind === 'respond_to_dispute') return { amountCents: captured, currency: claim.currency }
  return { amountCents: Math.max(0, claim.totalCents - captured), currency: claim.currency }
}

// The morning queue: every pending proposal, including those postponed until now, nearest deadline first. Four reads
// however many entries wait: the proposals, then the facts of every entry's amount together.
export async function morningQueue(transaction: Transaction, now: Date): Promise<QueueEntry[]> {
  const rows = await transaction.select({ proposal: proposals, deadline: shopExceptions.deadline, exceptionKind: shopExceptions.kind, moneyCents: shopExceptions.moneyCents })
    .from(proposals).leftJoin(shopExceptions, eq(shopExceptions.id, proposals.exceptionId))
    .where(and(eq(proposals.state, 'pending'), or(isNull(proposals.postponedUntil), lt(proposals.postponedUntil, now))))
  const facts = await amountFacts(transaction, rows.map(({ proposal }) => proposal))
  const entries = rows.map(({ proposal, deadline, exceptionKind, moneyCents }): QueueEntry => {
    const amount = amountOf(proposal, facts)
    return { id: proposal.id, kind: proposal.kind, subjectKind: proposal.subjectKind, subjectId: proposal.subjectId, rentalId: proposal.rentalId, reason: proposal.reason, references: proposal.references, draft: proposal.draft, raisedByAgent: proposal.raisedByAgent, model: proposal.model, deadline, exceptionKind, ...amount, moneyCents: amount.amountCents ?? moneyCents ?? 0, payload: proposal.payload }
  })
  return orderQueue(entries)
}

// The amount a proposal names, read now from the records, whatever state it is in: what a rule drafted from its
// rejection starts from.
export async function proposalAmount(transaction: Transaction, proposalId: string): Promise<{ amountCents: number | null; currency: string | null }> {
  const [proposal] = await transaction.select().from(proposals).where(eq(proposals.id, proposalId))
  return proposal === undefined ? NO_AMOUNT : amountOf(proposal, await amountFacts(transaction, [proposal]))
}

// What was decided in the last day, and what is put off until later, so the owner sees each outcome after the entry
// leaves the queue: approved, executing, done, failed, rejected, or superseded because its records changed.
export async function recentDecisions(transaction: Transaction, now: Date) {
  const since = new Date(now.getTime() - 24 * 3_600_000)
  return transaction.select({ id: proposals.id, kind: proposals.kind, state: proposals.state, reason: proposals.reason, decisionReason: proposals.decisionReason, decidedAt: proposals.decidedAt, postponedUntil: proposals.postponedUntil, payload: proposals.payload })
    .from(proposals)
    .where(or(gte(proposals.decidedAt, since), and(eq(proposals.state, 'pending'), gt(proposals.postponedUntil, now))))
    .orderBy(desc(proposals.updatedAt))
}

// Asks for a run now, as the nightly schedule does: through the outbox, ordered per shop. The relay adds the shop.
// trigger: why the run is asked for, as the ops agent's message names it: a person's check, or a dispute PayPal opened.
export async function queueOperationsCheck(transaction: Transaction, now: Date, trigger: 'manual' | 'dispute_opened' = 'manual'): Promise<string> {
  const [shop] = await transaction.select({ id: shops.id }).from(shops).limit(1)
  if (shop === undefined) throw new Error('No shop in scope.')
  const [row] = await transaction.insert(outbox).values({ shopId: shop.id, queue: OPS_AGENT_QUEUE, messageGroup: shop.id, payload: { trigger }, createdAt: now }).returning({ id: outbox.id })
  if (row === undefined) throw new Error('The check was not queued.')
  return row.id
}

export type DecisionInput = { readonly decision: 'approve' | 'reject' | 'postpone'; readonly reason: string; readonly mandateId?: string }
export type DecisionResult = { readonly ok: true; readonly state: 'approved' | 'rejected' | 'pending' | 'executing' | 'executed'; readonly proposalId: string } | { readonly ok: false; readonly reason: string }

// A person's decision on one proposal. Approval re-reads the state it was written against: if it changed, the
// proposal is superseded and nothing is executed (X1.5). An approved proposal hands its execution to the outbox.
export async function decideProposal(transaction: Transaction, proposalId: string, userId: string | null, input: DecisionInput, now: Date): Promise<DecisionResult> {
  const [proposal] = await transaction.select().from(proposals).where(eq(proposals.id, proposalId)).for('update')
  if (proposal === undefined) return { ok: false, reason: 'not_found' }
  if (proposal.state !== 'pending') return { ok: false, reason: 'not_pending' }
  if (input.decision === 'postpone') {
    await transaction.update(proposals).set({ postponedUntil: new Date(now.getTime() + 24 * 3_600_000), updatedAt: now }).where(eq(proposals.id, proposalId))
    return { ok: true, state: 'pending', proposalId }
  }
  if (input.decision === 'reject') {
    if (input.reason.trim() === '') return { ok: false, reason: 'reason_required' }
    await transaction.update(proposals).set({ state: 'rejected', decidedByUserId: userId, decisionReason: input.reason.trim(), decidedAt: now, updatedAt: now }).where(eq(proposals.id, proposalId))
    return { ok: true, state: 'rejected', proposalId }
  }
  if (await subjectFingerprint(transaction, proposal.subjectKind, proposal.subjectId) !== proposal.preconditionFingerprint) {
    await transaction.update(proposals).set({ state: 'superseded', decidedAt: now, updatedAt: now }).where(eq(proposals.id, proposalId))
    return { ok: false, reason: 'superseded' }
  }
  const authority = await approvalAuthority(transaction, proposal, userId, input.mandateId, now)
  if (!authority.ok) return authority
  const handed = await handOff(transaction, proposal, input, userId, now)
  if (!handed.ok) return handed
  const method = input.mandateId === undefined ? 'on_screen' as const : 'mandate' as const
  await transaction.insert(approvals).values({ shopId: proposal.shopId, subject: 'proposal', subjectId: proposal.id, decidedByUserId: userId, decision: 'approved', method, changes: [{ kind: proposal.kind, reason: input.reason.trim(), ...(input.mandateId === undefined ? {} : { mandateId: input.mandateId }) }], createdAt: now })
  await transaction.update(proposals).set({ state: handed.state, decidedByUserId: userId, mandateId: input.mandateId ?? null, decisionReason: input.reason.trim() || null, executionId: handed.executionId, decidedAt: now, updatedAt: now }).where(eq(proposals.id, proposalId))
  return { ok: true, state: handed.state, proposalId }
}

type Proposal = typeof proposals.$inferSelect

// A person approves on screen, or the owner's standing rule approves without one; never both, and never nobody. The
// mandate is read under the shop's own row security and checked by plain code, daily count included.
async function approvalAuthority(transaction: Transaction, proposal: Proposal, userId: string | null, mandateId: string | undefined, now: Date): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
  if (mandateId === undefined) return userId === null ? { ok: false, reason: 'mandate' } : { ok: true }
  if (userId !== null) return { ok: false, reason: 'mandate' }
  const mandate = await mandateForUse(transaction, mandateId)
  if (mandate === undefined) return { ok: false, reason: 'mandate' }
  const [exception] = proposal.exceptionId === null ? [] : await transaction.select({ kind: shopExceptions.kind }).from(shopExceptions).where(eq(shopExceptions.id, proposal.exceptionId))
  const dayStart = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`)
  const [done] = await transaction.select({ count: sql<number>`count(*)::int` }).from(proposals).where(and(eq(proposals.mandateId, mandateId), gte(proposals.decidedAt, dayStart)))
  return withinMandate({ kind: 'execute_proposal', proposalKind: proposal.kind, condition: exception?.kind ?? '', doneToday: done?.count ?? 0 }, mandate, now)
}
type HandOff = { readonly ok: true; readonly state: 'executing' | 'executed'; readonly executionId: string | null } | { readonly ok: false; readonly reason: string }

// Carries out an approved proposal by the path a person's click takes, in the same transaction, so a refusal there
// leaves the proposal pending. A spine execution moves the proposal on when PayPal confirms it (migration 0025).
async function handOff(transaction: Transaction, proposal: Proposal, input: DecisionInput, userId: string | null, now: Date): Promise<HandOff> {
  // A sample's proposal names simulated records: the decision is kept, and nothing is sent to PayPal or anyone.
  if (proposal.payload['simulated'] === 'yes') return { ok: true, state: 'executed', executionId: null }
  if (proposal.kind === 'note') return { ok: true, state: 'executed', executionId: null }
  if (proposal.kind === 'release_hold') {
    if (proposal.rentalId === null) return { ok: false, reason: 'not_found' }
    const approver = input.mandateId === undefined ? { userId: userId ?? '' } : { mandateId: input.mandateId }
    const released = await releaseCleanReturn(transaction, proposal.rentalId, approver, input.reason.trim() || proposal.reason, now)
    return released.ok ? { ok: true, state: 'executing', executionId: released.executionId } : released
  }
  if (proposal.kind === 'request_replacement_hold') {
    const [hold] = await transaction.select({ id: holds.id, authorizationId: holds.currentAuthorizationId }).from(holds).where(eq(holds.id, proposal.subjectId))
    if (hold === undefined || hold.authorizationId === null) return { ok: false, reason: 'not_found' }
    await transaction.insert(outbox).values({ shopId: proposal.shopId, queue: 'upkeep', messageGroup: hold.id, payload: { kind: 'replace', holdId: hold.id, authorizationId: hold.authorizationId }, createdAt: now })
    return { ok: true, state: 'executed', executionId: null }
  }
  // A message to the renter or an answer to PayPal on a dispute: the operations worker sends the approved draft.
  if (proposal.kind === 'send_message' || proposal.kind === 'respond_to_dispute') {
    if (proposal.draft === null || proposal.draft.trim() === '') return { ok: false, reason: 'draft_required' }
    await transaction.insert(outbox).values({ shopId: proposal.shopId, queue: OPS_EXECUTE_QUEUE, messageGroup: proposal.rentalId ?? proposal.id, payload: { proposalId: proposal.id }, createdAt: now })
    return { ok: true, state: 'executing', executionId: null }
  }
  // The spine invoices a balance itself once the charge is settled; refunds have no detector. Refusing keeps the
  // proposal pending and writes nothing.
  return { ok: false, reason: 'not_offered' }
}

// An approved message or dispute answer still to be sent, for the operations worker.
export async function proposalToCarryOut(transaction: Transaction, proposalId: string) {
  const [proposal] = await transaction.select({ id: proposals.id, kind: proposals.kind, subjectKind: proposals.subjectKind, subjectId: proposals.subjectId, rentalId: proposals.rentalId, draft: proposals.draft })
    .from(proposals).where(and(eq(proposals.id, proposalId), eq(proposals.state, 'executing'), isNull(proposals.executionId)))
  return proposal
}

export async function finishProposal(transaction: Transaction, proposalId: string, state: 'executed' | 'failed', now: Date): Promise<void> {
  await transaction.update(proposals).set({ state, updatedAt: now }).where(and(eq(proposals.id, proposalId), eq(proposals.state, 'executing')))
}

// Every live proposal that names one of these holds, for releasing several in one approval.
export async function pendingProposals(transaction: Transaction, ids: readonly string[]) {
  return ids.length === 0 ? [] : transaction.select().from(proposals).where(and(inArray(proposals.id, [...ids]), eq(proposals.state, 'pending')))
}

// The holds PayPal still reserves money for, with the authorization each rests on and how it was placed: what the
// nightly check reads back. Not a sample's: its authorization was never on PayPal.
export async function holdsToReconcile(transaction: Transaction) {
  return transaction.select({ holdId: holds.id, rentalId: holds.rentalId, state: holds.state, strategy: holds.strategy, authorizationId: authorizations.paypalAuthorizationId })
    .from(holds).innerJoin(authorizations, eq(authorizations.id, holds.currentAuthorizationId)).innerJoin(rentals, eq(rentals.id, holds.rentalId))
    .where(and(inArray(holds.state, ['placed', 'at_risk']), eq(rentals.simulated, false)))
}

// Which of these exceptions already have a proposal waiting for the owner: a run asks the model about none of them
// again, since what it would write is already on the queue.
export async function exceptionsAwaitingOwner(transaction: Transaction, exceptionIds: readonly string[]): Promise<ReadonlySet<string>> {
  if (exceptionIds.length === 0) return new Set()
  const rows = await transaction.select({ exceptionId: proposals.exceptionId }).from(proposals).where(and(inArray(proposals.exceptionId, [...exceptionIds]), eq(proposals.state, 'pending')))
  return new Set(rows.flatMap((row) => (row.exceptionId === null ? [] : [row.exceptionId])))
}

// Which rental each captured payment belongs to, so a dispute PayPal names by its capture finds its rental.
export async function rentalsForCaptures(transaction: Transaction, captureIds: readonly string[]): Promise<Record<string, string>> {
  if (captureIds.length === 0) return {}
  const rows = await transaction.select({ reference: moneyEvents.paypalReference, rentalId: moneyEvents.rentalId }).from(moneyEvents).where(inArray(moneyEvents.paypalReference, [...captureIds]))
  return Object.fromEntries(rows.map((row) => [row.reference, row.rentalId]))
}

export type AgentCallLine = { readonly runId: string | null; readonly tool: string; readonly subjectKind: string | null; readonly subjectId: string | null; readonly outcome: string; readonly milliseconds: number }

// One audit line for each tool call an agent makes, allowed or refused (extensions.md section 4.4, X1.7).
export async function auditAgentCall(transaction: Transaction, line: AgentCallLine, now: Date): Promise<void> {
  const [shop] = await transaction.select({ id: shops.id }).from(shops).limit(1)
  if (shop === undefined) throw new Error('No shop in scope.')
  await transaction.insert(auditLog).values({ shopId: shop.id, actorKind: 'shop_agent', actorId: 'operations_agent', action: `agent.tool.${line.tool}`, subjectKind: line.subjectKind, subjectId: line.subjectId, source: line.runId, detail: { outcome: line.outcome, milliseconds: line.milliseconds }, at: now })
}

// The records an exception names, for the model to read: states, amounts, dates and PayPal references. No name,
// email or comment: what the model reads cannot steer it with a renter's words, and it learns nothing it need not.
export async function exceptionFacts(transaction: Transaction, subjectKind: string, subjectId: string) {
  let rentalId: string | undefined
  if (subjectKind === 'rental') rentalId = subjectId
  else if (subjectKind === 'hold') rentalId = (await transaction.select({ rentalId: holds.rentalId }).from(holds).where(eq(holds.id, subjectId)))[0]?.rentalId
  else if (subjectKind === 'claim') rentalId = (await transaction.select({ rentalId: claims.rentalId }).from(claims).where(eq(claims.id, subjectId)))[0]?.rentalId
  else if (subjectKind === 'invoice') rentalId = (await transaction.select({ rentalId: invoices.rentalId }).from(invoices).where(eq(invoices.id, subjectId)))[0]?.rentalId
  if (rentalId === undefined) return { subjectKind, subjectId }
  const [rental] = await transaction.select({ id: rentals.id, state: rentals.state, startsAt: rentals.startsAt, endsAt: rentals.endsAt, currency: rentals.currency, feeCents: rentals.feeCents }).from(rentals).where(eq(rentals.id, rentalId))
  const [hold] = await transaction.select({ id: holds.id, state: holds.state, reservedCents: holds.reservedCents, currency: holds.currency, stateChangedAt: holds.stateChangedAt, authorization: authorizations.paypalAuthorizationId, validUntil: authorizations.validUntil, assuredUntil: authorizations.assuredUntil })
    .from(holds).leftJoin(authorizations, eq(authorizations.id, holds.currentAuthorizationId)).where(eq(holds.rentalId, rentalId))
  const [claim] = await transaction.select({ id: claims.id, state: claims.state, totalCents: claims.totalCents, replyDueAt: claims.replyDueAt }).from(claims).where(eq(claims.rentalId, rentalId))
  const payments = await transaction.select({ kind: moneyEvents.kind, amountCents: moneyEvents.amountCents, currency: moneyEvents.currency, paypalReference: moneyEvents.paypalReference, occurredAt: moneyEvents.occurredAt }).from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId))
  const bills = await transaction.select({ state: invoices.state, amountCents: invoices.amountCents, paypalInvoiceId: invoices.paypalInvoiceId, sentAt: invoices.sentAt }).from(invoices).where(eq(invoices.rentalId, rentalId))
  return { subjectKind, subjectId, rental, hold, claim: claim ?? null, payments, invoices: bills }
}

// Every shop the nightly run visits, read across shops by a function only the worker may call.
export async function shopsForOperations(database: Database, paypalMode: 'sandbox' | 'live'): Promise<string[]> {
  const rows = await outsideShop(database, (transaction) => transaction.select({ shopId: sql<string>`shop.shop_id` }).from(sql`hold_shops_for_operations(${paypalMode}) as shop`), 'hold_worker')
  return rows.map((row) => row.shopId)
}
