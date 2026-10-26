import { money, settle } from '@hold/domain'
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import { approvals, captureSessions, claimLines, claimReplies, claims, comparisons, executions, findings, holds, incidents, invoices, items, marks, moneyEvents, photos, priceEntries, rentalItems, rentals, users } from './schema/index.ts'
import type { Transaction } from './scope.ts'

export async function claimWorkspace(transaction: Transaction, rentalId: string) {
  const [rental] = await transaction.select().from(rentals).where(eq(rentals.id, rentalId))
  if (rental === undefined) return undefined
  const [hold] = await transaction.select().from(holds).where(eq(holds.rentalId, rentalId))
  if (hold === undefined) return undefined
  const [claim] = await transaction.select().from(claims).where(eq(claims.rentalId, rentalId))
  const prices = await transaction.select({ id: priceEntries.id, description: priceEntries.description, amountCents: priceEntries.amountCents }).from(priceEntries).where(eq(priceEntries.priceListId, rental.priceListId)).orderBy(asc(priceEntries.description))
  const possibleFindings = await transaction.select({ id: findings.id, description: findings.description, suggestedPriceEntryId: findings.suggestedPriceEntryId, comparisonId: comparisons.id, view: findings.view }).from(findings)
    .innerJoin(comparisons, eq(comparisons.id, findings.comparisonId)).innerJoin(captureSessions, eq(captureSessions.id, comparisons.returnSessionId)).innerJoin(rentalItems, eq(rentalItems.id, captureSessions.rentalItemId))
    .where(and(eq(rentalItems.rentalId, rentalId), eq(comparisons.simulated, false), eq(findings.secondLookConfirmed, true)))
  const rows = claim === undefined ? [] : await transaction.select({ id: claimLines.id, amountCents: claimLines.amountCents, description: priceEntries.description, reason: claimLines.reason, actorName: users.name, findingId: claimLines.findingId, source: claimLines.source, incidentId: claimLines.incidentId }).from(claimLines)
    .innerJoin(priceEntries, eq(priceEntries.id, claimLines.priceEntryId)).leftJoin(users, eq(users.id, claimLines.addedByUserId)).where(eq(claimLines.claimId, claim.id)).orderBy(asc(claimLines.createdAt), asc(claimLines.id))
  const photo = async (sessionId: string, view: string) => (await transaction.select({ key: photos.displayKey }).from(photos).where(and(eq(photos.sessionId, sessionId), eq(photos.view, view), isNull(photos.supersededAt))))[0]?.key ?? null
  const lines = await Promise.all(rows.map(async (line) => {
    const [finding] = line.findingId === null ? [] : await transaction.select({ description: findings.description, view: findings.view, region: findings.region, beforeSession: comparisons.handoverSessionId, afterSession: comparisons.returnSessionId }).from(findings).innerJoin(comparisons, eq(comparisons.id, findings.comparisonId)).where(eq(findings.id, line.findingId))
    // A line the renter agreed shows the handover photograph and theirs, with the box they drew.
    const reported = line.incidentId === null ? undefined : await incidentEvidence(transaction, line.incidentId)
    const evidence = finding === undefined ? reported : { description: finding.description, region: finding.region, beforeKey: await photo(finding.beforeSession, finding.view), afterKey: await photo(finding.afterSession, finding.view) }
    return { ...line, findingDescription: finding?.description ?? null, incidentDescription: reported?.description ?? null, region: evidence?.region ?? null, beforeKey: evidence?.beforeKey ?? null, afterKey: evidence?.afterKey ?? null }
  }))
  // Lines the renter agreed during the rental, for staff to keep, lower or leave out when they draft the claim.
  const agreedIncidents = await transaction.select({ id: incidents.id, description: incidents.description, agreedCents: incidents.agreedCents, priceDescription: priceEntries.description, itemLabel: items.label }).from(incidents)
    .innerJoin(priceEntries, eq(priceEntries.id, incidents.agreedPriceEntryId)).innerJoin(rentalItems, eq(rentalItems.id, incidents.rentalItemId)).innerJoin(items, eq(items.id, rentalItems.itemId))
    .where(and(eq(incidents.rentalId, rentalId), eq(incidents.state, 'agreed'))).orderBy(asc(incidents.reportedAt))
  const protectedReply = claim === undefined ? false : (await transaction.select().from(executions).where(and(eq(executions.rentalId, rentalId), eq(executions.action, 'capture')))).some((execution) => execution.paypalResourceIds['claim'] === claim.id && execution.paypalResourceIds['early'] === 'true')
  const payments = await transaction.select({ kind: moneyEvents.kind, amountCents: moneyEvents.amountCents, currency: moneyEvents.currency }).from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId))
  const bills = await transaction.select({ id: invoices.id, state: invoices.state, amountCents: invoices.amountCents }).from(invoices).where(eq(invoices.rentalId, rentalId))
  const [execution] = await transaction.select({ state: executions.state, action: executions.action, lastError: executions.lastError }).from(executions).where(and(eq(executions.rentalId, rentalId), eq(executions.holdId, hold.id))).orderBy(desc(executions.createdAt), desc(sql`case ${executions.action} when 'refund' then 5 when 'invoice' then 4 when 'capture' then 3 when 'release' then 2 else 1 end`), desc(executions.updatedAt)).limit(1)
  const replies = claim === undefined ? [] : await transaction.select({ decision: claimReplies.decision, comment: claimReplies.comment }).from(claimReplies).where(eq(claimReplies.claimId, claim.id)).orderBy(asc(claimReplies.createdAt))
  const decisions = claim === undefined ? [] : await transaction.select({ decision: approvals.decision, name: users.name }).from(approvals).leftJoin(users, eq(users.id, approvals.decidedByUserId)).where(eq(approvals.subjectId, claim.id)).orderBy(asc(approvals.createdAt))
  const refundedCents = payments.filter((payment) => payment.kind === 'refunded').reduce((sum, payment) => sum + payment.amountCents, 0)
  const effectiveTotal = claim?.state === 'waived' || hold.state === 'released' || decisions.some((decision) => decision.decision === 'waived') ? 0 : Math.max(0, (claim?.totalCents ?? 0) - refundedCents)
  const amounts = hold.state === 'invoiced' || (hold.state === 'expired' && bills.length > 0) ? { capture: money(0, rental.currency), release: money(hold.reservedCents, rental.currency), invoice: money(effectiveTotal, rental.currency) } : settle(money(effectiveTotal, rental.currency), money(hold.reservedCents, hold.currency))
  return { protectedReply, agreedIncidents, rentalId, rentalState: rental.state, currency: rental.currency, simulated: rental.simulated, reservedCents: hold.reservedCents, holdState: hold.state, claim: claim === undefined ? null : { id: claim.id, state: claim.state, totalCents: claim.totalCents, raisedByUserId: claim.raisedByUserId, replyDueAt: claim.replyDueAt }, prices, possibleFindings, lines, payments, invoices: bills, execution: execution ?? null, replies, decisions, amounts }
}
export type ClaimWorkspace = NonNullable<Awaited<ReturnType<typeof claimWorkspace>>>

// The renter's words, their mark and the two photographs of its view: the handover's and the one they took.
async function incidentEvidence(transaction: Transaction, incidentId: string) {
  const [row] = await transaction.select({ description: incidents.description, sessionId: incidents.sessionId, rentalItemId: incidents.rentalItemId, view: marks.view, region: marks.region }).from(incidents)
    .leftJoin(marks, eq(marks.incidentId, incidents.id)).where(eq(incidents.id, incidentId))
  if (row === undefined) return undefined
  const [handover] = await transaction.select({ id: captureSessions.id }).from(captureSessions).where(and(eq(captureSessions.rentalItemId, row.rentalItemId), eq(captureSessions.kind, 'handover')))
  const key = async (sessionId: string | undefined) => row.view === null || sessionId === undefined ? null : (await transaction.select({ key: photos.displayKey }).from(photos).where(and(eq(photos.sessionId, sessionId), eq(photos.view, row.view), isNull(photos.supersededAt))))[0]?.key ?? null
  return { description: row.description, region: row.region, beforeKey: await key(handover?.id), afterKey: await key(row.sessionId) }
}
