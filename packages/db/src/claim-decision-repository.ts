import { reserveEvidencePack } from './evidence-repository.ts'
import { CLAIM_TRANSITIONS, transition } from '@hold/domain'
import { and, count, eq } from 'drizzle-orm'
import { resolveClaimSettlement } from './claim-resolution.ts'
import { claimStaff } from './claim-access.ts'
import { confirmCleanReturn } from './claim-repository.ts'
import { queueClaimCapture } from './claim-reply-repository.ts'
import { approvals, auditLog, claimReplies, claims, executions, staffRoles } from './schema/index.ts'
import type { Transaction } from './scope.ts'

export async function decideClaim(transaction: Transaction, claimId: string, userId: string, decision: 'uphold' | 'waive', reason: string, now: Date) {
  const [claim] = await transaction.select().from(claims).where(eq(claims.id, claimId)).for('update')
  if (claim === undefined) return { ok: false, reason: 'not_found' } as const
  if (reason.trim() === '') return { ok: false, reason: 'reason_required' } as const
  const [staffCount] = await transaction.select({ count: count() }).from(staffRoles)
  const replies = await transaction.select().from(claimReplies).where(eq(claimReplies.claimId, claim.id))
  const earlyCapture = (await transaction.select().from(executions).where(and(eq(executions.rentalId, claim.rentalId), eq(executions.action, 'capture')))).find((row) => row.paypalResourceIds['claim'] === claim.id && row.paypalResourceIds['early'] === 'true')
  const protectedContest = ['charging', 'charged', 'charge_failed'].includes(claim.state) && earlyCapture !== undefined && replies.some((reply) => reply.decision === 'contest')
  // A claim the advocates did not settle is decided like any contested claim (extensions.md section 9.9).
  const contested = claim.state === 'contested' || claim.state === 'escalated' || protectedContest
  const allowed = await claimStaff(transaction, userId, claim.currency, contested ? { kind: 'decide_contested_claim', raisedBy: claim.raisedByUserId ?? '', shopStaffCount: staffCount?.count ?? 0 } : { kind: 'reduce_or_waive_claim', raisedBy: claim.raisedByUserId ?? '' })
  if (!allowed.ok) return allowed
  if (protectedContest) {
    if (earlyCapture.paypalResourceIds['decision'] !== undefined) return { ok: false, reason: 'decision_recorded' } as const
    const [approval] = await transaction.insert(approvals).values({ shopId: claim.shopId, subject: 'claim', subjectId: claim.id, decidedByUserId: userId, decision: decision === 'waive' ? 'waived' : 'approved', method: 'on_screen', changes: [{ reason: reason.trim(), decision }], createdAt: now }).returning()
    if (approval === undefined) throw new Error('The decision was not recorded.')
    await transaction.update(executions).set({ paypalResourceIds: { ...earlyCapture.paypalResourceIds, decision, decisionApproval: approval.id }, updatedAt: now }).where(eq(executions.id, earlyCapture.id))
    await transaction.insert(auditLog).values({ shopId: claim.shopId, actorKind: 'person', actorId: userId, action: `claim.${decision}`, subjectKind: 'claim', subjectId: claim.id, detail: { reason: reason.trim() }, at: now })
    const executionId = await resolveClaimSettlement(transaction, claim.id, now)
    await reserveEvidencePack(transaction, claim.rentalId, now)
    return { ok: true, rentalId: claim.rentalId, executionId: executionId ?? earlyCapture.id } as const
  }
  let state = claim.state
  if (contested) {
    if (!transition(CLAIM_TRANSITIONS, state, 'decided').ok) return { ok: false, reason: 'not_contested' } as const
    await transaction.update(claims).set({ state: 'decided' }).where(eq(claims.id, claimId))
    state = 'decided'
  }
  if (decision === 'uphold' && !contested) return { ok: false, reason: 'not_contested' } as const
  if (decision === 'waive' && !transition(CLAIM_TRANSITIONS, state, 'waived').ok) return { ok: false, reason: 'not_waivable' } as const
  await transaction.insert(approvals).values({ shopId: claim.shopId, subject: 'claim', subjectId: claim.id, decidedByUserId: userId, decision: decision === 'waive' ? 'waived' : 'approved', method: 'on_screen', changes: [{ reason: reason.trim(), previousTotalCents: claim.totalCents, decision }], createdAt: now })
  await transaction.insert(auditLog).values({ shopId: claim.shopId, actorKind: 'person', actorId: userId, action: `claim.${decision}`, subjectKind: 'claim', subjectId: claim.id, detail: { reason: reason.trim() }, at: now })
  if (decision === 'uphold') return queueClaimCapture(transaction, claim.id, now)
  await transaction.update(claims).set({ state: 'waived' }).where(eq(claims.id, claim.id))
  return confirmCleanReturn(transaction, claim.rentalId, userId, reason, now)
}
