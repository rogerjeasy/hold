import type { AgentActor, Mandate } from '@hold/domain'
import { and, eq, gt, isNull, lte } from 'drizzle-orm'
import { escalateNegotiation } from './negotiation-ending.ts'
import { applyNegotiationMove, queueNegotiation } from './negotiation-repository.ts'
import type { MoveResult } from './negotiation-repository.ts'
import type { NegotiationTool } from './negotiation-tools.ts'
import { assistantAdvocate, mandateFromRow } from './settlement-mandate-repository.ts'
import { mandates, negotiations } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// A renter's own assistant as their advocate (extensions.md section 9.11). Its negotiation scope is not on its agent
// token, which never changes once issued: it is the renter's live settlement mandate naming that assistant's session,
// granted with the renter's one-time code for this rental's one claim. Revoking the mandate, or the session, ends it.

export type AssistantGrant = { readonly negotiationId: string; readonly rentalId: string; readonly shopId: string; readonly mandate: Mandate }

export async function assistantGrant(transaction: Transaction, sessionId: string, now: Date): Promise<AssistantGrant | undefined> {
  const [row] = await transaction
    .select({ mandate: mandates, negotiationId: negotiations.id, rentalId: negotiations.rentalId, shopId: negotiations.shopId })
    .from(mandates)
    .innerJoin(negotiations, eq(negotiations.renterMandateId, mandates.id))
    .where(and(eq(mandates.kind, 'settlement_renter'), eq(mandates.agent, assistantAdvocate(sessionId)), isNull(mandates.revokedAt), lte(mandates.validFrom, now), gt(mandates.validUntil, now)))
  return row === undefined ? undefined : { negotiationId: row.negotiationId, rentalId: row.rentalId, shopId: row.shopId, mandate: mandateFromRow(row.mandate) }
}

export type AssistantMoveResult =
  | { readonly ok: true; readonly negotiationId: string; readonly result: MoveResult; readonly outboxId: string | null }
  | { readonly ok: false; readonly reason: 'not_granted' }

// One move by the assistant, through the same gateway and referee as Hold's advocates. When it leaves the shop to move,
// the shop's advocate is handed the turn through the outbox.
export async function submitAssistantMove(transaction: Transaction, input: { readonly sessionId: string; readonly actor: AgentActor; readonly tool: NegotiationTool; readonly arguments: unknown }, now: Date): Promise<AssistantMoveResult> {
  const grant = await assistantGrant(transaction, input.sessionId, now)
  if (grant === undefined) return { ok: false, reason: 'not_granted' }
  const result = await applyNegotiationMove(transaction, { negotiationId: grant.negotiationId, actor: input.actor, agent: assistantAdvocate(input.sessionId), tool: input.tool, arguments: input.arguments, model: null, promptVersion: null }, now)
  const outboxId = result.outcome === 'accepted' && result.state === 'open' ? await queueNegotiation(transaction, grant, now) : null
  return { ok: true, negotiationId: grant.negotiationId, result, outboxId }
}

// The renter disconnected the assistant: every mandate naming it is revoked, and a negotiation it was arguing goes to
// the owner. Nothing is captured.
export async function endAssistantGrants(transaction: Transaction, sessionId: string, now: Date): Promise<void> {
  const revoked = await transaction.update(mandates).set({ revokedAt: now }).where(and(eq(mandates.agent, assistantAdvocate(sessionId)), isNull(mandates.revokedAt))).returning({ id: mandates.id })
  for (const mandate of revoked) {
    const running = await transaction.select({ id: negotiations.id }).from(negotiations).where(eq(negotiations.renterMandateId, mandate.id))
    for (const negotiation of running) await escalateNegotiation(transaction, negotiation.id, 'mandate_ended', now)
  }
}
