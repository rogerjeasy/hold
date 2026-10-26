import { CLAIM_TRANSITIONS, NEGOTIATION_TRANSITIONS, transition } from '@hold/domain'
import type { EscalationReason } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { reserveEvidencePack } from './evidence-repository.ts'
import { auditLog, claims, negotiations } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// Sends a negotiation to the owner (extensions.md section 9.9): the negotiation and its claim move forward to
// escalated, never back to contested, and the owner decides with the transcript. Nothing is captured. A reply the
// renter's advocate was writing leaves the claim contested, as in the spine.
export async function escalateNegotiation(transaction: Transaction, negotiationId: string, reason: EscalationReason, now: Date): Promise<boolean> {
  const [negotiation] = await transaction.select().from(negotiations).where(eq(negotiations.id, negotiationId)).for('update')
  if (negotiation === undefined || !transition(NEGOTIATION_TRANSITIONS, negotiation.state, 'escalated').ok) return false
  await transaction.update(negotiations).set({ state: 'escalated', endedReason: reason, endedAt: now, updatedAt: now }).where(eq(negotiations.id, negotiationId))
  const [claim] = await transaction.select({ id: claims.id, state: claims.state }).from(claims).where(eq(claims.id, negotiation.claimId)).for('update')
  if (claim !== undefined && claim.state !== 'contested' && transition(CLAIM_TRANSITIONS, claim.state, 'escalated').ok) await transaction.update(claims).set({ state: 'escalated' }).where(eq(claims.id, claim.id))
  await transaction.insert(auditLog).values({ shopId: negotiation.shopId, actorKind: 'referee', action: 'negotiation.escalated', subjectKind: 'negotiation', subjectId: negotiationId, detail: { reason }, at: now })
  await reserveEvidencePack(transaction, negotiation.rentalId, now)
  return true
}
