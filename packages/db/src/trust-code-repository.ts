import { timingSafeEqual } from 'node:crypto'
import { claimCodeRecipient } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { renterLinks, rentals, renters } from './schema/index.ts'
import { shopPayPalMode } from './paypal-mode.ts'
import type { Transaction } from './scope.ts'

// The one-time code a renter gives before consenting to, withdrawing or deleting their Clean Record (extensions.md
// section 7.6). Staff open view links at the counter, so the link alone cannot act for the renter. The code works as a
// claim reply's does (claim-code-repository.ts), sent to the address PayPal gave for the payer, with the same labelled
// sandbox rule, but it is kept apart on the link so one never stands in for the other.

const CODE_MINUTES = 10
const RESEND_AFTER_MS = 60_000
const MOST_ATTEMPTS = 3

export type IssuedTrustCode = { readonly ok: true; readonly email: string; readonly sandboxContact: boolean } | { readonly ok: false; readonly reason: 'link_invalid' | 'code_recently_sent' | 'payer_missing' }

export async function issueTrustCode(transaction: Transaction, linkId: string, hash: string, now: Date): Promise<IssuedTrustCode> {
  const [link] = await transaction.select().from(renterLinks).where(eq(renterLinks.id, linkId)).for('update')
  if (link === undefined || link.revokedAt !== null || link.expiresAt <= now || !link.scopes.includes('view')) return { ok: false, reason: 'link_invalid' }
  if (link.trustCodeExpiresAt !== null && link.trustCodeExpiresAt.getTime() - CODE_MINUTES * 60_000 + RESEND_AFTER_MS > now.getTime()) return { ok: false, reason: 'code_recently_sent' }
  const [payer] = await transaction.select({ email: renters.email, contactEmail: rentals.contactEmail }).from(rentals).innerJoin(renters, eq(renters.id, rentals.renterId)).where(eq(rentals.id, link.rentalId))
  if (payer === undefined) return { ok: false, reason: 'payer_missing' }
  const recipient = claimCodeRecipient({ paypalMode: await shopPayPalMode(transaction, link.shopId), payerEmail: payer.email, contactEmail: payer.contactEmail })
  await transaction.update(renterLinks).set({ trustCodeHash: hash, trustCodeExpiresAt: new Date(now.getTime() + CODE_MINUTES * 60_000), trustCodeAttempts: 0 }).where(eq(renterLinks.id, linkId))
  return { ok: true, ...recipient }
}

export type UsedTrustCode = { readonly ok: true } | { readonly ok: false; readonly reason: 'code_expired' | 'wrong_code' }

// Spends the code: right, it works once; wrong, it counts a try, and three wrong tries end it.
export async function useTrustCode(transaction: Transaction, linkId: string, hash: string, now: Date): Promise<UsedTrustCode> {
  const [link] = await transaction.select().from(renterLinks).where(eq(renterLinks.id, linkId)).for('update')
  if (link === undefined || link.revokedAt !== null || link.expiresAt <= now || link.trustCodeHash === null || link.trustCodeExpiresAt === null || link.trustCodeExpiresAt <= now || link.trustCodeAttempts >= MOST_ATTEMPTS) return { ok: false, reason: 'code_expired' }
  const expected = Buffer.from(link.trustCodeHash)
  const given = Buffer.from(hash)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    await transaction.update(renterLinks).set({ trustCodeAttempts: link.trustCodeAttempts + 1 }).where(eq(renterLinks.id, linkId))
    return { ok: false, reason: 'wrong_code' }
  }
  await transaction.update(renterLinks).set({ trustCodeHash: null, trustCodeExpiresAt: null }).where(eq(renterLinks.id, linkId))
  return { ok: true }
}
