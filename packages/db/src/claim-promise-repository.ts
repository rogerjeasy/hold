import { CLAIM_TRANSITIONS, decideByFor, missedPromiseOutcome, promiseStanding, transition, withinMandate } from '@hold/domain'
import type { ClaimState } from '@hold/domain'
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { claimStaff } from './claim-access.ts'
import { releaseCleanReturn } from './claim-repository.ts'
import { reserveEvidencePack } from './evidence-repository.ts'
import { escalateNegotiation } from './negotiation-ending.ts'
import { liveStandingRule } from './ops-settings-repository.ts'
import { approvals, auditLog, authorizations, claimMessages as messages, claims, holds, negotiations, outbox, renters, rentals, shops, staffRoles, users } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// The shop's promise to decide a contested claim, and the words between renter and shop (architecture.md section 6.16).

const MESSAGE_LIMIT = 1000
const NOT_SHOWN: readonly ClaimState[] = ['draft', 'awaiting_approval', 'approved']
const PROMISE_REASON = 'decision_promise_missed'

// Already checked against DECISION_PROMISE by the caller. Claims already presented keep the days they were shown.
export async function saveDecisionPromiseDays(transaction: Transaction, shopId: string, days: number): Promise<void> {
  await transaction.update(shops).set({ decisionPromiseDays: days }).where(eq(shops.id, shopId))
}

export async function decisionPromiseDays(transaction: Transaction): Promise<number> {
  const [shop] = await transaction.select({ days: shops.decisionPromiseDays }).from(shops).limit(1)
  if (shop === undefined) throw new Error('No shop in scope.')
  return shop.days
}

// Fixes the date when the renter contests, from the days the claim was presented with, and asks the upkeep queue to
// look again at that date. A hold already captured cannot lapse, so only an uncaptured hold's validity limits it.
export async function makeClaimPromise(transaction: Transaction, claim: { readonly id: string; readonly shopId: string; readonly rentalId: string; readonly promiseDays: number | null }, now: Date): Promise<void> {
  if (claim.promiseDays === null) return
  const [shop] = await transaction.select({ timeZone: shops.timeZone, closes: shops.closesAt }).from(shops).where(eq(shops.id, claim.shopId))
  if (shop === undefined) throw new Error('The claim has no shop.')
  const [hold] = await transaction.select({ state: holds.state, validUntil: authorizations.validUntil }).from(holds).leftJoin(authorizations, eq(authorizations.id, holds.currentAuthorizationId)).where(eq(holds.rentalId, claim.rentalId))
  const validUntil = hold === undefined || ['captured', 'capturing'].includes(hold.state) ? null : hold.validUntil
  const decideBy = decideByFor({ contestedAt: now, days: claim.promiseDays, timeZone: shop.timeZone, closes: shop.closes, validUntil })
  await transaction.update(claims).set({ decideBy }).where(eq(claims.id, claim.id))
  await transaction.insert(outbox).values({ shopId: claim.shopId, queue: 'upkeep', messageGroup: claim.rentalId, payload: { kind: 'claim_promise', claimId: claim.id }, createdAt: now })
}

// What both claim pages show: the days promised, the date once contested, where it stands, and, when the shop missed
// it and decided afterwards, the reason the deciding person wrote, which the renter is owed.
export async function promiseFor(transaction: Transaction, rentalId: string, now: Date) {
  const [claim] = await transaction.select().from(claims).where(eq(claims.rentalId, rentalId))
  if (claim?.promiseDays == null) return undefined
  const standing = promiseStanding(claim, now)
  const [decision] = standing === 'missed' && claim.decidedAt !== null ? await transaction.select({ changes: approvals.changes }).from(approvals).where(and(eq(approvals.subject, 'claim'), eq(approvals.subjectId, claim.id), gte(approvals.createdAt, claim.decidedAt))).orderBy(desc(approvals.createdAt)).limit(1) : []
  const reason = decision?.changes[0]?.['reason']
  return { days: claim.promiseDays, decideBy: claim.decideBy, decidedAt: claim.decidedAt, missedAt: claim.promiseMissedAt, standing, missedReason: typeof reason === 'string' && reason !== PROMISE_REASON ? reason : null }
}

// Marks a contested claim decided, the first time only. The guard trigger keeps the first time.
export async function markClaimDecided(transaction: Transaction, claim: { readonly id: string; readonly decideBy: Date | null; readonly decidedAt: Date | null }, now: Date): Promise<void> {
  if (claim.decideBy !== null && claim.decidedAt === null) await transaction.update(claims).set({ decidedAt: now }).where(eq(claims.id, claim.id))
}

type Kept =
  | { readonly outcome: 'not_found' | 'kept' | 'already_missed' | 'decided_late' }
  | { readonly outcome: 'not_due'; readonly decideBy: Date; readonly rentalId: string }
  | { readonly outcome: 'escalated'; readonly rentalId: string }
  | { readonly outcome: 'waived'; readonly rentalId: string; readonly executionId: string | null }

// Run by the upkeep queue at the date. An undecided claim is waived under the owner's rule when one is live and covers
// it, and otherwise goes to the owner, who alone may decide it from now on. Either way it is recorded once.
export async function keepClaimPromise(transaction: Transaction, claimId: string, now: Date): Promise<Kept> {
  const [claim] = await transaction.select().from(claims).where(eq(claims.id, claimId)).for('update')
  if (claim?.decideBy == null) return { outcome: 'not_found' }
  if (claim.promiseMissedAt !== null) return { outcome: 'already_missed' }
  const standing = promiseStanding(claim, now)
  if (standing === 'open') return { outcome: 'not_due', decideBy: claim.decideBy, rentalId: claim.rentalId }
  if (standing === 'kept') return { outcome: 'kept' }
  await transaction.update(claims).set({ promiseMissedAt: now }).where(eq(claims.id, claimId))
  if (claim.decidedAt !== null) return { outcome: 'decided_late' }
  const mandate = await liveStandingRule(transaction, now, PROMISE_REASON)
  const covered = mandate !== undefined && withinMandate({ kind: 'execute_proposal', proposalKind: 'release_hold', condition: PROMISE_REASON, doneToday: await waivedToday(transaction, mandate.id, now) }, mandate, now).ok
  const outcome = missedPromiseOutcome(claim.state, covered)
  await transaction.insert(auditLog).values({ shopId: claim.shopId, actorKind: 'system', action: 'claim.promise_missed', subjectKind: 'claim', subjectId: claimId, detail: { decideBy: claim.decideBy.toISOString(), outcome }, at: now })
  const [negotiation] = await transaction.select({ id: negotiations.id }).from(negotiations).where(eq(negotiations.claimId, claimId))
  if (negotiation !== undefined) await escalateNegotiation(transaction, negotiation.id, 'promise_missed', now)
  let state = (await transaction.select({ state: claims.state }).from(claims).where(eq(claims.id, claimId)))[0]?.state ?? claim.state
  if (transition(CLAIM_TRANSITIONS, state, 'escalated').ok) {
    await transaction.update(claims).set({ state: 'escalated' }).where(eq(claims.id, claimId))
    state = 'escalated'
  }
  await reserveEvidencePack(transaction, claim.rentalId, now)
  if (outcome === 'escalate' || mandate === undefined) return { outcome: 'escalated', rentalId: claim.rentalId }
  for (const next of ['decided', 'waived'] as const) {
    if (!transition(CLAIM_TRANSITIONS, state, next).ok) throw new Error('A missed promise could not waive the claim.')
    state = next
  }
  await transaction.update(claims).set({ state, decidedAt: now }).where(eq(claims.id, claimId))
  await transaction.insert(approvals).values({ shopId: claim.shopId, subject: 'claim', subjectId: claimId, decidedByUserId: null, decision: 'waived', method: 'mandate', mandateId: mandate.id, changes: [{ reason: PROMISE_REASON, previousTotalCents: claim.totalCents, decision: 'waive' }], createdAt: now })
  const released = await releaseCleanReturn(transaction, claim.rentalId, { mandateId: mandate.id }, PROMISE_REASON, now)
  return { outcome: 'waived', rentalId: claim.rentalId, executionId: released.ok ? released.executionId : null }
}

async function waivedToday(transaction: Transaction, mandateId: string, now: Date): Promise<number> {
  const dayStart = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`)
  const [done] = await transaction.select({ count: sql<number>`count(*)::int` }).from(approvals).where(and(eq(approvals.mandateId, mandateId), eq(approvals.subject, 'claim'), gte(approvals.createdAt, dayStart)))
  return done?.count ?? 0
}

export async function claimMessages(transaction: Transaction, rentalId: string) {
  return transaction.select({ id: messages.id, author: messages.author, authorName: users.name, body: messages.body, createdAt: messages.createdAt })
    .from(messages).innerJoin(claims, eq(claims.id, messages.claimId)).leftJoin(users, eq(users.id, messages.authorUserId))
    .where(eq(claims.rentalId, rentalId)).orderBy(asc(messages.createdAt), asc(messages.id))
}

type MessageInput = { readonly rentalId: string; readonly author: 'renter' | 'shop'; readonly userId: string | null; readonly body: string }

// The renter writes through their claim link; staff who may act on claims answer. Kept exactly as written, trimmed.
export async function writeClaimMessage(transaction: Transaction, input: MessageInput, now: Date) {
  const body = input.body.trim()
  if (body === '' || body.length > MESSAGE_LIMIT) return { ok: false, reason: 'message_invalid' } as const
  const [claim] = await transaction.select().from(claims).where(eq(claims.rentalId, input.rentalId))
  if (claim === undefined || NOT_SHOWN.includes(claim.state) || claim.state === 'closed') return { ok: false, reason: 'not_found' } as const
  if (input.author === 'shop') {
    const allowed = await claimStaff(transaction, input.userId ?? '', claim.currency)
    if (!allowed.ok) return allowed
  }
  const [row] = await transaction.insert(messages).values({ shopId: claim.shopId, claimId: claim.id, author: input.author, authorUserId: input.author === 'shop' ? input.userId : null, body, createdAt: now }).returning({ id: messages.id })
  if (row === undefined) throw new Error('The message was not recorded.')
  return { ok: true, messageId: row.id, claimId: claim.id } as const
}

// Who hears that a renter wrote: the shop's owners and managers, each in their language, and the renter's name.
export async function claimMessageRecipients(transaction: Transaction, rentalId: string) {
  const [rental] = await transaction.select({ renter: sql<string | null>`coalesce(${renters.name}, ${rentals.contactName})`, shopName: shops.name }).from(rentals).innerJoin(shops, eq(shops.id, rentals.shopId)).leftJoin(renters, eq(renters.id, rentals.renterId)).where(eq(rentals.id, rentalId))
  if (rental === undefined) return undefined
  const recipients = await transaction.select({ email: users.email, language: users.language }).from(staffRoles).innerJoin(users, eq(users.id, staffRoles.userId)).where(inArray(staffRoles.role, ['owner', 'manager']))
  return { renter: rental.renter ?? '—', shopName: rental.shopName, recipients }
}

export type ClaimPromise = NonNullable<Awaited<ReturnType<typeof promiseFor>>>
export type ClaimMessage = Awaited<ReturnType<typeof claimMessages>>[number]
