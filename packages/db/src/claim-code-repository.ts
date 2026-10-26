import { timingSafeEqual } from 'node:crypto'
import { claimCodeRecipient, claimReplyAllowed } from '@hold/domain'
import { and, desc, eq } from 'drizzle-orm'
import { claimReplies, claims, executions, paypalAccounts, renterLinks, rentals, renters } from './schema/index.ts'
import type { Transaction } from './scope.ts'

type Link = typeof renterLinks.$inferSelect

// The one-time code for a renter's money decision (architecture.md section 12.3): stored as its digest on the link, sent
// to the address PayPal gave for the payer, or in the sandbox to the booking's contact. Every money decision a renter
// makes through a link issues its code here, so the rule for who receives it lives in one place.
export async function storeRenterCode(transaction: Transaction, link: Link, hash: string, now: Date) {
  if (link.claimCodeExpiresAt !== null && link.claimCodeExpiresAt.getTime() - 540000 > now.getTime()) return { ok: false, reason: 'code_recently_sent' } as const
  const [payer] = await transaction.select({ email: renters.email, contactEmail: rentals.contactEmail }).from(rentals).innerJoin(renters, eq(renters.id, rentals.renterId)).where(eq(rentals.id, link.rentalId))
  if (payer === undefined) return { ok: false, reason: 'payer_missing' } as const
  // A shop with no account on record is treated as live: the stricter rule.
  const [account] = await transaction.select({ mode: paypalAccounts.mode }).from(paypalAccounts).where(eq(paypalAccounts.shopId, link.shopId)).orderBy(desc(paypalAccounts.createdAt)).limit(1)
  const recipient = claimCodeRecipient({ paypalMode: account?.mode === 'sandbox' ? 'sandbox' : 'live', payerEmail: payer.email, contactEmail: payer.contactEmail })
  await transaction.update(renterLinks).set({ claimCodeHash: hash, claimCodeExpiresAt: new Date(now.getTime() + 600000), claimCodeAttempts: 0 }).where(eq(renterLinks.id, link.id))
  return { ok: true, ...recipient } as const
}

// The link, locked, if it is live and carries every scope named.
export async function liveLink(transaction: Transaction, linkId: string, scopes: readonly string[], now: Date): Promise<Link | undefined> {
  const [link] = await transaction.select().from(renterLinks).where(eq(renterLinks.id, linkId)).for('update')
  if (link === undefined || link.revokedAt !== null || link.expiresAt <= now || !scopes.every((scope) => link.scopes.includes(scope))) return undefined
  return link
}

export async function issueClaimCode(transaction: Transaction, linkId: string, hash: string, now: Date) {
  const link = await liveLink(transaction, linkId, ['accept', 'contest'], now)
  if (link === undefined) return { ok: false, reason: 'link_invalid' } as const
  const [claim] = await transaction.select().from(claims).where(eq(claims.rentalId, link.rentalId))
  if (claim === undefined) return { ok: false, reason: 'reply_expired' } as const
  const capture = (await transaction.select().from(executions).where(and(eq(executions.rentalId, link.rentalId), eq(executions.action, 'capture')))).some((row) => row.paypalResourceIds['claim'] === claim.id && row.paypalResourceIds['early'] === 'true')
  const replies = await transaction.select().from(claimReplies).where(eq(claimReplies.claimId, claim.id))
  if (!claimReplyAllowed(claim.state, claim.replyDueAt, now, capture, replies.length > 0)) return { ok: false, reason: 'reply_expired' } as const
  return storeRenterCode(transaction, link, hash, now)
}

export async function useClaimCode(transaction: Transaction, linkId: string, hash: string, now: Date) {
  const [link] = await transaction.select().from(renterLinks).where(eq(renterLinks.id, linkId)).for('update')
  if (link === undefined || link.revokedAt !== null || link.expiresAt <= now || link.claimCodeHash === null || link.claimCodeExpiresAt === null || link.claimCodeExpiresAt <= now || link.claimCodeAttempts >= 3) return { ok: false, reason: 'code_expired' } as const
  const expected = Buffer.from(link.claimCodeHash); const given = Buffer.from(hash)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    await transaction.update(renterLinks).set({ claimCodeAttempts: link.claimCodeAttempts + 1 }).where(eq(renterLinks.id, linkId))
    return { ok: false, reason: 'wrong_code' } as const
  }
  await transaction.update(renterLinks).set({ claimCodeHash: null, claimCodeExpiresAt: null }).where(eq(renterLinks.id, linkId))
  return { ok: true } as const
}
