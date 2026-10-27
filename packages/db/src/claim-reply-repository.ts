import { reserveEvidencePack } from './evidence-repository.ts'
import { claimDeadlineAction, CLAIM_TRANSITIONS, HOLD_TRANSITIONS, money, planCharge, settle, transition } from '@hold/domain'
import { and, eq } from 'drizzle-orm'
import { resolveClaimSettlement } from './claim-resolution.ts'
import { EXECUTIONS_QUEUE } from './fee-repository.ts'
import { approvals, authorizations, claimReplies, claims, executions, holds, outbox } from './schema/index.ts'
import type { Transaction } from './scope.ts'

export async function queueClaimCapture(transaction: Transaction, claimId: string, now: Date, protectExpiry = false) {
  const [claim] = await transaction.select().from(claims).where(eq(claims.id, claimId)).for('update')
  if (claim === undefined) return { ok: false, reason: 'not_found' } as const
  const [hold] = await transaction.select().from(holds).where(eq(holds.rentalId, claim.rentalId)).for('update')
  if (hold === undefined || hold.currentAuthorizationId === null) return { ok: false, reason: 'hold_unavailable' } as const
  const [approved] = await transaction.select().from(approvals).where(and(eq(approvals.subject, 'claim'), eq(approvals.subjectId, claim.id), eq(approvals.decision, 'approved')))
  if (approved === undefined) return { ok: false, reason: 'not_approved' } as const
  const idempotencyKey = `claim-capture-${claim.id}`
  const [existing] = await transaction.select().from(executions).where(eq(executions.idempotencyKey, idempotencyKey))
  if (existing !== undefined) return { ok: true, executionId: existing.id, rentalId: claim.rentalId } as const
  if (!transition(CLAIM_TRANSITIONS, claim.state, 'charging').ok || (hold.state !== 'expired' && !transition(HOLD_TRANSITIONS, hold.state, 'capturing').ok)) return { ok: false, reason: 'not_chargeable' } as const
  const [authorization] = await transaction.select().from(authorizations).where(eq(authorizations.id, hold.currentAuthorizationId))
  if (authorization === undefined) return { ok: false, reason: 'hold_unavailable' } as const
  if (claim.state === 'presented' && (!protectExpiry || claim.replyDueAt === null || claimDeadlineAction(claim.state, claim.replyDueAt, authorization.validUntil, now) !== 'protect')) return { ok: false, reason: 'not_chargeable' } as const
  const amounts = settle(money(claim.totalCents, claim.currency), money(hold.reservedCents, hold.currency))
  const [execution] = await transaction.insert(executions).values({ shopId: claim.shopId, rentalId: claim.rentalId, holdId: hold.id, action: 'capture', idempotencyKey, amountCents: amounts.capture.cents, currency: claim.currency, paypalResourceIds: { authorization: authorization.paypalAuthorizationId, claim: claim.id, ...(protectExpiry ? { early: 'true' } : {}) }, createdAt: now, updatedAt: now }).returning()
  if (execution === undefined) throw new Error('The capture was not queued.')
  await transaction.insert(outbox).values({ shopId: claim.shopId, queue: EXECUTIONS_QUEUE, messageGroup: claim.rentalId, payload: { executionId: execution.id }, createdAt: now })
  await transaction.update(claims).set({ state: 'charging' }).where(eq(claims.id, claim.id))
  if (hold.state !== 'expired') {
    const next = planCharge({ assuredUntil: authorization.assuredUntil, validUntil: authorization.validUntil, isRenewal: authorization.renewedFromId !== null }, now).kind === 'renew_then_capture' ? 'renewing' : 'capturing'
    if (!transition(HOLD_TRANSITIONS, hold.state, next).ok) throw new Error('The queued capture cannot reserve this hold.')
    await transaction.update(holds).set({ state: next }).where(eq(holds.id, hold.id))
  }
  await reserveEvidencePack(transaction, claim.rentalId, now)
  return { ok: true, executionId: execution.id, rentalId: claim.rentalId } as const
}

// The shared renter handler verifies a claim-scoped token and consumes its one-time code in this transaction. A contest
// handed to an advocate needs no written reason: the advocate writes the arguments (extensions.md section 9).
export async function replyToClaim(transaction: Transaction, rentalId: string, decision: 'accept' | 'contest', comment: string, now: Date, reasonRequired = true) {
  const [claim] = await transaction.select().from(claims).where(eq(claims.rentalId, rentalId)).for('update')
  if (claim === undefined) return { ok: false, reason: 'not_found' } as const
  const capture = (await transaction.select().from(executions).where(and(eq(executions.rentalId, rentalId), eq(executions.action, 'capture')))).find((row) => row.paypalResourceIds['claim'] === claim.id && row.paypalResourceIds['early'] === 'true')
  const early = capture !== undefined && ['charging', 'charged', 'charge_failed'].includes(claim.state)
  if (claim.state !== 'presented' && !early) return { ok: false, reason: 'already_replied' } as const
  if ((await transaction.select().from(claimReplies).where(eq(claimReplies.claimId, claim.id))).length > 0) return { ok: false, reason: 'already_replied' } as const
  if (claim.replyDueAt === null || now >= claim.replyDueAt) return { ok: false, reason: 'reply_expired' } as const
  if (decision === 'contest' && reasonRequired && comment.trim() === '') return { ok: false, reason: 'reason_required' } as const
  if (early) {
    await transaction.insert(claimReplies).values({ shopId: claim.shopId, claimId: claim.id, decision, comment: comment.trim(), createdAt: now })
    const executionId = await resolveClaimSettlement(transaction, claim.id, now)
    await reserveEvidencePack(transaction, rentalId, now)
    return { ok: true, executionId: executionId ?? null, rentalId } as const
  }
  const target = decision === 'accept' ? 'accepted' : 'contested'
  if (!transition(CLAIM_TRANSITIONS, claim.state, target).ok) return { ok: false, reason: 'already_replied' } as const
  await transaction.insert(claimReplies).values({ shopId: claim.shopId, claimId: claim.id, decision, comment: comment.trim(), createdAt: now })
  await transaction.update(claims).set({ state: target }).where(eq(claims.id, claim.id))
  await reserveEvidencePack(transaction, rentalId, now)
  if (decision === 'contest') return { ok: true, executionId: null, rentalId } as const
  return queueClaimCapture(transaction, claim.id, now)
}
