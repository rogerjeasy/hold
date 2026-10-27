import type { Mandate, OwnerRule, ReminderKind } from '@hold/domain'
import { and, desc, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm'
import { mandates, opsRules, reminders, rentals, shops } from './schema/index.ts'
import type { Transaction } from './scope.ts'

async function shopInScope(transaction: Transaction): Promise<string> {
  const [shop] = await transaction.select({ id: shops.id }).from(shops).limit(1)
  if (shop === undefined) throw new Error('No shop in scope.')
  return shop.id
}

// A rule drafted from a rejection (extensions.md section 6.5). It does nothing until the owner confirms it.
export async function draftRule(transaction: Transaction, rule: OwnerRule, fromProposalId: string | null, now: Date): Promise<string> {
  const [row] = await transaction.insert(opsRules).values({ shopId: await shopInScope(transaction), rule, fromProposalId, createdAt: now }).returning({ id: opsRules.id })
  if (row === undefined) throw new Error('The rule was not recorded.')
  return row.id
}

// A drafted rule is confirmed or discarded; a confirmed one can still be discarded, and then leaves the agent's memory.
export async function decideRule(transaction: Transaction, ruleId: string, userId: string, decision: 'confirm' | 'discard', now: Date): Promise<boolean> {
  const from = decision === 'confirm' ? eq(opsRules.state, 'drafted') : inArray(opsRules.state, ['drafted', 'confirmed'])
  const updated = await transaction.update(opsRules).set({ state: decision === 'confirm' ? 'confirmed' : 'discarded', decidedByUserId: userId, decidedAt: now }).where(and(eq(opsRules.id, ruleId), from)).returning({ id: opsRules.id })
  return updated.length > 0
}

// Confirms a drafted rule in the shape the owner chose, "never" or "below an amount", for the kind it was drafted for and
// no other. A changed shape is a new rule: the draft is discarded and its replacement recorded, confirmed, beside it.
export async function confirmRule(transaction: Transaction, ruleId: string, userId: string, rule: OwnerRule, now: Date): Promise<boolean> {
  const [drafted] = await transaction.select().from(opsRules).where(and(eq(opsRules.id, ruleId), eq(opsRules.state, 'drafted'))).for('update')
  if (drafted === undefined || drafted.rule.proposalKind !== rule.proposalKind) return false
  if (JSON.stringify(drafted.rule) === JSON.stringify(rule)) return decideRule(transaction, ruleId, userId, 'confirm', now)
  await decideRule(transaction, ruleId, userId, 'discard', now)
  return decideRule(transaction, await draftRule(transaction, rule, drafted.fromProposalId, now), userId, 'confirm', now)
}

// The agent's whole memory: the rules the owner confirmed.
export async function confirmedRules(transaction: Transaction): Promise<OwnerRule[]> {
  return (await transaction.select({ rule: opsRules.rule }).from(opsRules).where(eq(opsRules.state, 'confirmed')).orderBy(opsRules.createdAt)).map((row) => row.rule)
}

export async function rulesForOwner(transaction: Transaction) {
  return transaction.select({ id: opsRules.id, rule: opsRules.rule, state: opsRules.state, fromProposalId: opsRules.fromProposalId, createdAt: opsRules.createdAt }).from(opsRules).where(or(eq(opsRules.state, 'drafted'), eq(opsRules.state, 'confirmed'))).orderBy(desc(opsRules.createdAt))
}

// The one standing rule the hackathon build offers: release a hold when the comparison was clean and nobody confirmed
// it in the set time (section 6.4). Off until the owner grants it.
export async function grantStandingRule(transaction: Transaction, ownerId: string, limits: { readonly dailyCount: number; readonly days: number }, now: Date): Promise<string> {
  const [row] = await transaction.insert(mandates).values({
    shopId: await shopInScope(transaction), kind: 'ops_standing_rule', grantedByUserId: ownerId, agent: 'operations_agent',
    limits: { proposalKind: 'release_hold', condition: 'clean_return_unconfirmed', dailyCount: limits.dailyCount },
    validFrom: now, validUntil: new Date(now.getTime() + limits.days * 24 * 3_600_000), grantedHow: 'on_screen', createdAt: now,
  }).returning({ id: mandates.id })
  if (row === undefined) throw new Error('The mandate was not recorded.')
  return row.id
}

export async function revokeMandate(transaction: Transaction, mandateId: string, now: Date): Promise<boolean> {
  const updated = await transaction.update(mandates).set({ revokedAt: now }).where(and(eq(mandates.id, mandateId), isNull(mandates.revokedAt))).returning({ id: mandates.id })
  return updated.length > 0
}

const asMandate = (row: typeof mandates.$inferSelect): Mandate => ({ id: row.id, kind: row.kind, grantedTo: row.agent, validFrom: row.validFrom, validUntil: row.validUntil, revokedAt: row.revokedAt, limits: row.limits })

export async function liveStandingRule(transaction: Transaction, now: Date): Promise<Mandate | undefined> {
  const [row] = await transaction.select().from(mandates).where(and(eq(mandates.kind, 'ops_standing_rule'), isNull(mandates.revokedAt), lte(mandates.validFrom, now), gt(mandates.validUntil, now))).orderBy(desc(mandates.createdAt)).limit(1)
  return row === undefined ? undefined : asMandate(row)
}

// Any of the shop's mandates, live or not, locked until the transaction ends: two approvals under one mandate count
// its daily uses one after the other. The caller checks it with withinMandate.
export async function mandateForUse(transaction: Transaction, mandateId: string): Promise<Mandate | undefined> {
  const [row] = await transaction.select().from(mandates).where(eq(mandates.id, mandateId)).for('update')
  return row === undefined ? undefined : asMandate(row)
}

const day = (now: Date) => now.toISOString().slice(0, 10)

// Records a reminder about to be sent; false when one of this kind already went to this renter today.
export async function recordReminder(transaction: Transaction, input: { readonly kind: ReminderKind; readonly rentalId: string }, now: Date): Promise<boolean> {
  const [rental] = await transaction.select({ renterId: rentals.renterId }).from(rentals).where(eq(rentals.id, input.rentalId))
  const written = await transaction.insert(reminders).values({ shopId: await shopInScope(transaction), kind: input.kind, renterId: rental?.renterId ?? null, rentalId: input.rentalId, sentOn: day(now), createdAt: now }).onConflictDoNothing().returning({ id: reminders.id })
  return written.length > 0
}

export async function remindersSentOn(transaction: Transaction, now: Date) {
  return transaction.select({ kind: reminders.kind, renterId: reminders.renterId }).from(reminders).where(eq(reminders.sentOn, day(now)))
}
