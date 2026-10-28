import { randomUUID } from 'node:crypto'
import { agentSessions } from '../schema/index.ts'
import type { ReadyRentalShop } from './ready-rental.ts'

// For the tests of a renter's own assistant on a rental Hold already has: its session, with an agent token whose
// fingerprint the test chooses, issued now and lasting the given days.
export async function connectedAssistant(shop: ReadyRentalShop, rentalId: string, now: Date, options: { readonly fingerprint?: string; readonly days?: number; readonly clientLabel?: string } = {}): Promise<{ readonly sessionId: string; readonly fingerprint: string }> {
  const fingerprint = options.fingerprint ?? `token-${randomUUID()}`
  const [session] = await shop.act((transaction) =>
    transaction
      .insert(agentSessions)
      .values({
        shopId: shop.scope.shopId,
        rentalId,
        bookingSecretFingerprint: `booking-${randomUUID()}`,
        tokenFingerprint: fingerprint,
        scopes: ['rental', 'hold', 'condition', 'claim', 'record'],
        clientLabel: options.clientLabel ?? 'Trip planner',
        tokenIssuedAt: now,
        expiresAt: new Date(now.getTime() + (options.days ?? 30) * 86_400_000),
      })
      .returning({ id: agentSessions.id }),
  )
  if (session === undefined) throw new Error('The assistant session was not recorded.')
  return { sessionId: session.id, fingerprint }
}
