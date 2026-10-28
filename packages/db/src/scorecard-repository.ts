import { verdictForFinding } from '@hold/domain'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { approvals, captureSessions, claimLines, claimReplies, claims, comparisons, evalRuns, findingOutcomes, findings, priceEntries, rentalItems } from './schema/index.ts'
import type { Database, Transaction } from './scope.ts'

// The classes of finding a person has to decide on. Wear and known marks never become claim lines.
const DECIDED_CLASSES = ['new_damage', 'missing_part', 'uncertain'] as const

// Labels every finding of a closing rental with what a person finally did with it (extensions.md section 5.7).
// Findings from demonstration photographs are left out: they say nothing about the comparison. Written once.
export async function recordFindingOutcomes(transaction: Transaction, rentalId: string, now: Date): Promise<void> {
  const raised = await transaction.select({ id: findings.id, shopId: findings.shopId }).from(findings)
    .innerJoin(comparisons, eq(comparisons.id, findings.comparisonId))
    .innerJoin(captureSessions, eq(captureSessions.id, comparisons.returnSessionId))
    .innerJoin(rentalItems, eq(rentalItems.id, captureSessions.rentalItemId))
    .where(and(eq(rentalItems.rentalId, rentalId), eq(comparisons.simulated, false), inArray(findings.class, [...DECIDED_CLASSES])))
  if (raised.length === 0) return
  const [claim] = await transaction.select().from(claims).where(eq(claims.rentalId, rentalId))
  const lines = claim === undefined ? [] : await transaction.select({ findingId: claimLines.findingId, amountCents: claimLines.amountCents, publishedCents: priceEntries.amountCents, addedBy: claimLines.addedByUserId }).from(claimLines).innerJoin(priceEntries, eq(priceEntries.id, claimLines.priceEntryId)).where(eq(claimLines.claimId, claim.id))
  const replies = claim === undefined ? [] : await transaction.select({ decision: claimReplies.decision }).from(claimReplies).where(eq(claimReplies.claimId, claim.id))
  const decisions = claim === undefined ? [] : await transaction.select({ decision: approvals.decision, by: approvals.decidedByUserId }).from(approvals).where(and(eq(approvals.subject, 'claim'), eq(approvals.subjectId, claim.id))).orderBy(desc(approvals.createdAt))
  const waived = claim?.state === 'waived' || decisions.some((decision) => decision.decision === 'waived')
  const contested = replies.some((reply) => reply.decision === 'contest')
  for (const finding of raised) {
    const line = lines.find((each) => each.findingId === finding.id)
    const verdict = verdictForFinding({ line: line === undefined ? null : { amountCents: line.amountCents, publishedCents: line.publishedCents }, contested, waived })
    await transaction.insert(findingOutcomes).values({ shopId: finding.shopId, rentalId, findingId: finding.id, claimId: claim?.id ?? null, verdict, decidedByUserId: decisions[0]?.by ?? line?.addedBy ?? null, decidedAt: now }).onConflictDoNothing()
  }
}

export type FieldRecordMonth = { readonly month: string; readonly removed: number; readonly total: number }

// By month, how many findings a person removed out of all the findings decided: the sign that the comparison and the
// shop's staff have started to disagree.
export async function fieldRecord(transaction: Transaction): Promise<readonly FieldRecordMonth[]> {
  const month = sql<string>`to_char(${findingOutcomes.decidedAt} at time zone 'UTC', 'YYYY-MM')`
  const rows = await transaction.select({ month, removed: sql<number | string>`count(*) filter (where ${findingOutcomes.verdict} in ('removed_by_staff', 'removed_after_contest'))`, total: sql<number | string>`count(*)` })
    .from(findingOutcomes).groupBy(month).orderBy(month)
  return rows.map((row) => ({ month: row.month, removed: Number(row.removed), total: Number(row.total) }))
}

// The run the scorecard shows and the next run is measured against: the last accepted run of the gate half.
export async function acceptedEvalRun(transaction: Transaction) {
  const [run] = await transaction.select().from(evalRuns).where(and(eq(evalRuns.half, 'gate'), eq(evalRuns.accepted, true))).orderBy(desc(evalRuns.completedAt)).limit(1)
  return run
}

// Every run of the gate half, oldest first, as run against run shows them with the lines their gate drew. Their pairs
// stay behind: only the accepted run's are shown.
export async function gateRunHistory(transaction: Transaction) {
  return transaction
    .select({ id: evalRuns.id, completedAt: evalRuns.completedAt, accepted: evalRuns.accepted, gatePassed: evalRuns.gatePassed, pipelineVersion: evalRuns.pipelineVersion, measures: evalRuns.measures, gateLimits: evalRuns.gateLimits })
    .from(evalRuns)
    .where(eq(evalRuns.half, 'gate'))
    .orderBy(asc(evalRuns.completedAt))
}

export type EvalRunRecord = typeof evalRuns.$inferInsert

// Only the evaluation runner calls these, logged in as the database owner: no service may write a run.
export async function recordEvalRun(database: Database, run: EvalRunRecord): Promise<string> {
  const [row] = await database.insert(evalRuns).values(run).returning({ id: evalRuns.id })
  if (row === undefined) throw new Error('The run was not recorded.')
  return row.id
}

export async function acceptedEvalRunAsOwner(database: Database) {
  const [run] = await database.select().from(evalRuns).where(and(eq(evalRuns.half, 'gate'), eq(evalRuns.accepted, true))).orderBy(desc(evalRuns.completedAt)).limit(1)
  return run
}
