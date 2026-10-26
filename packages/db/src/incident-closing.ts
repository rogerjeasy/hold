import { INCIDENT_TRANSITIONS, transition } from '@hold/domain'
import type { IncidentState } from '@hold/domain'
import { and, eq, inArray } from 'drizzle-orm'
import { incidents, marks } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// What happens to a rental's incidents as the rental is returned, claimed and closed (extensions.md section 10.4).
// Each move is one the incident machine lists; none moves an incident back.

async function moveAll(transaction: Transaction, rentalId: string, from: IncidentState, to: IncidentState, set: Partial<typeof incidents.$inferInsert> = {}): Promise<void> {
  if (!transition(INCIDENT_TRANSITIONS, from, to).ok) throw new Error(`An incident cannot move from ${from} to ${to}.`)
  await transaction.update(incidents).set({ ...set, state: to }).where(and(eq(incidents.rentalId, rentalId), eq(incidents.state, from)))
}

// At the return, a price the renter did not agree to lapses: a person decides, through the ordinary claim.
export async function lapseUnagreedOffers(transaction: Transaction, rentalId: string): Promise<void> {
  await moveAll(transaction, rentalId, 'triaged', 'awaiting_staff')
}

// A claim drafted for the rental takes on every report still waiting for a person.
export async function openClaimIncidents(transaction: Transaction, rentalId: string): Promise<void> {
  await moveAll(transaction, rentalId, 'awaiting_staff', 'claim_opened')
}

// When the rental closes, its decided reports are resolved, and every mark its renter reported joins the item's
// history as an ordinary known mark, so the next renter is never charged for it.
export async function closeRentalIncidents(transaction: Transaction, rentalId: string, now: Date): Promise<void> {
  for (const state of ['agreed', 'shop_matter', 'claim_opened'] as const) await moveAll(transaction, rentalId, state, 'resolved', { resolvedAt: now })
  const reported = await transaction.select({ id: incidents.id }).from(incidents).where(eq(incidents.rentalId, rentalId))
  if (reported.length > 0) await transaction.update(marks).set({ status: 'open' }).where(and(eq(marks.status, 'reported'), inArray(marks.incidentId, reported.map((row) => row.id))))
}
