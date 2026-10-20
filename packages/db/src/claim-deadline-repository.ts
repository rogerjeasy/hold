import { chargeTime, claimDeadlineAction, CLAIM_TRANSITIONS, transition } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { queueClaimCapture } from './claim-reply-repository.ts'
import { authorizations, claims, holds } from './schema/index.ts'
import type { Transaction } from './scope.ts'
export async function claimDeadlineWork(transaction: Transaction, claimId: string) {
  const [claim] = await transaction.select().from(claims).where(eq(claims.id, claimId)).for('update')
  if (claim?.replyDueAt == null) return undefined
  const [hold] = await transaction.select().from(holds).where(eq(holds.rentalId, claim.rentalId))
  if (hold?.currentAuthorizationId == null) return undefined
  const [authorization] = await transaction.select().from(authorizations).where(eq(authorizations.id, hold.currentAuthorizationId))
  return authorization === undefined ? undefined : { claim, at: chargeTime(claim.replyDueAt, authorization.validUntil).at, validUntil: authorization.validUntil }
}
export async function claimDue(transaction: Transaction, claimId: string, now: Date) {
  const work = await claimDeadlineWork(transaction, claimId)
  if (work === undefined) return { ok: false, reason: 'not_found' } as const
  const action = claimDeadlineAction(work.claim.state, work.claim.replyDueAt ?? now, work.validUntil, now)
  if (action === 'wait') return { ok: false, reason: 'not_due' } as const
  if (action === 'lapse' && transition(CLAIM_TRANSITIONS, work.claim.state, 'lapsed').ok) await transaction.update(claims).set({ state: 'lapsed' }).where(eq(claims.id, claimId))
  return queueClaimCapture(transaction, claimId, now, action === 'protect')
}
