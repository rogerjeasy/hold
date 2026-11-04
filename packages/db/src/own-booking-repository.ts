import { desc, eq } from 'drizzle-orm'
import { agentSessions, rentals } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// A demo visitor's own latest booking, for the hosted assistant to follow when they ask about it (extensions.md section
// 8.10). The visitor's browser proved the demo shop is theirs; the assistant still reaches the booking only as any
// assistant does, by a booking secret through Hold's MCP server. Sample rentals are never one.

// followable: no assistant follows it yet. A rental has one assistant at most, and its secrets are issued once.
export type OwnBooking = { readonly rentalId: string; readonly followable: boolean }

export async function latestOwnBooking(transaction: Transaction): Promise<OwnBooking | undefined> {
  const [rental] = await transaction.select({ id: rentals.id }).from(rentals).where(eq(rentals.simulated, false)).orderBy(desc(rentals.createdAt), desc(rentals.id)).limit(1)
  if (rental === undefined) return undefined
  const [session] = await transaction.select({ id: agentSessions.id }).from(agentSessions).where(eq(agentSessions.rentalId, rental.id))
  return { rentalId: rental.id, followable: session === undefined }
}

export type FollowResult = { readonly ok: true; readonly rentalId: string } | { readonly ok: false; readonly reason: 'no_booking' | 'already_followed' }

// Binds a booking secret to the latest booking, as if the hosted assistant had made it, unless an assistant already
// follows it: then its secret stays the one it was given. Only the fingerprint is kept.
export async function followOwnBooking(transaction: Transaction, input: { readonly shopId: string; readonly bookingSecretFingerprint: string; readonly clientLabel: string }, now: Date): Promise<FollowResult> {
  const latest = await latestOwnBooking(transaction)
  if (latest === undefined) return { ok: false, reason: 'no_booking' }
  if (!latest.followable) return { ok: false, reason: 'already_followed' }
  const [session] = await transaction
    .insert(agentSessions)
    .values({ shopId: input.shopId, rentalId: latest.rentalId, bookingSecretFingerprint: input.bookingSecretFingerprint, clientLabel: input.clientLabel, createdAt: now })
    .onConflictDoNothing({ target: agentSessions.rentalId })
    .returning({ id: agentSessions.id })
  return session === undefined ? { ok: false, reason: 'already_followed' } : { ok: true, rentalId: latest.rentalId }
}
