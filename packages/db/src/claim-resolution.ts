import { CLAIM_TRANSITIONS, transition } from '@hold/domain'
import { and, eq } from 'drizzle-orm'
import { beginClaimInvoice } from './claim-invoice-repository.ts'
import { confirmCleanReturn } from './claim-repository.ts'
import { queueClaimRefund } from './claim-refund-repository.ts'
import { closeSettledRental, settlementWork } from './settlement-repository.ts'
import { approvals, claimReplies, claims, executions } from './schema/index.ts'
import type { Transaction } from './scope.ts'

export async function claimCollectionReady(transaction: Transaction, claimId: string, now: Date) {
  const [claim] = await transaction.select().from(claims).where(eq(claims.id, claimId))
  const [capture] = await transaction.select().from(executions).where(eq(executions.idempotencyKey, `claim-capture-${claimId}`))
  if (claim === undefined || capture === undefined) return false
  if (capture.paypalResourceIds['early'] !== 'true') return true
  const decision = capture.paypalResourceIds['decision']
  if (decision !== undefined) return decision === 'uphold'
  const replies = await transaction.select().from(claimReplies).where(eq(claimReplies.claimId, claimId))
  return replies.some((reply) => reply.decision === 'accept') || (replies.length === 0 && claim.replyDueAt !== null && now >= claim.replyDueAt)
}

// Called in the same transaction as a reply, decision or capture confirmation.
// The outbox obligation survives a crash between committing the result and sending its next job.
export async function resolveClaimSettlement(transaction: Transaction, claimId: string, now: Date): Promise<string | undefined> {
  const [claim] = await transaction.select().from(claims).where(eq(claims.id, claimId)).for('update')
  const [capture] = await transaction.select().from(executions).where(eq(executions.idempotencyKey, `claim-capture-${claimId}`))
  if (claim === undefined || capture === undefined || !['charged', 'charge_failed'].includes(claim.state)) return undefined
  if (capture.paypalResourceIds['decision'] === 'waive') {
    const [approval] = await transaction.select().from(approvals).where(and(eq(approvals.subjectId, claim.id), eq(approvals.id, capture.paypalResourceIds['decisionApproval'] ?? '00000000-0000-0000-0000-000000000000')))
    if (approval === undefined || approval.decidedByUserId === null) return undefined
    const reason = approval.changes[0]?.['reason']
    if (typeof reason !== 'string') return undefined
    if (claim.state === 'charged') {
      const refund = await queueClaimRefund(transaction, claim.id, approval.decidedByUserId, reason, now)
      return refund.ok ? refund.executionId : undefined
    }
    if (!transition(CLAIM_TRANSITIONS, claim.state, 'waived').ok) return undefined
    await transaction.update(claims).set({ state: 'waived' }).where(eq(claims.id, claim.id))
    const release = await confirmCleanReturn(transaction, claim.rentalId, approval.decidedByUserId, reason, now)
    return release.ok ? release.executionId : undefined
  }
  if (!await claimCollectionReady(transaction, claim.id, now)) return undefined
  const invoiceId = await beginClaimInvoice(transaction, capture.id, claim.state === 'charge_failed', '', now)
  if (invoiceId !== undefined) return invoiceId
  if (claim.state === 'charged' && transition(CLAIM_TRANSITIONS, claim.state, 'closed').ok) {
    const work = await settlementWork(transaction, capture.id)
    await transaction.update(claims).set({ state: 'closed' }).where(eq(claims.id, claim.id))
    if (work !== undefined) await closeSettledRental(transaction, claim.rentalId, work.hold.state, now)
  }
  return undefined
}
