import { escalateNegotiation, inShop, negotiationRecords, openNegotiations } from '@hold/db'
import type { Database, DatabaseRole, NegotiationRecords } from '@hold/db'
import { negotiationEnding } from '@hold/domain'
import type { EscalationReason } from '@hold/domain'

// Run on a schedule (infra/lib/negotiation-worker.ts): sends to the owner every open negotiation that has run out of
// time with nobody moving, such as one whose side is a renter's own assistant that went quiet. A negotiation ends at
// its deadline, when a side's ten minutes for a move pass, or when a mandate ended. Nothing is captured.

function endingOf(records: NegotiationRecords, now: Date): EscalationReason | null {
  if (records.context !== undefined) return negotiationEnding(records.context, records.table, now)
  // A reply, written by the renter's side alone, has until its deadline and the renter's mandate.
  const mandate = records.renterMandate
  if (now >= records.negotiation.deadline) return 'deadline'
  return (mandate.revokedAt !== null && mandate.revokedAt <= now) || now >= mandate.validUntil ? 'mandate_ended' : null
}

export async function endStaleNegotiations(dependencies: { readonly database: Database; readonly role: DatabaseRole; readonly now: () => Date }, shopId: string): Promise<number> {
  return inShop(dependencies.database, { role: dependencies.role, shopId }, async (transaction) => {
    const open = await openNegotiations(transaction)
    let ended = 0
    for (const { id } of open) {
      const records = await negotiationRecords(transaction, id)
      const reason = records === undefined ? null : endingOf(records, dependencies.now())
      if (reason !== null && await escalateNegotiation(transaction, id, reason, dependencies.now())) ended += 1
    }
    return ended
  })
}
