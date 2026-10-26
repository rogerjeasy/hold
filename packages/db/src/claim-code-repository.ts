import { timingSafeEqual } from 'node:crypto'
import { claimCodeRecipient, claimReplyAllowed } from '@hold/domain'
import { and, desc, eq } from 'drizzle-orm'
import { claimReplies, claims, executions, paypalAccounts, renterLinks, rentals, renters } from './schema/index.ts'
import type { Transaction } from './scope.ts'

export async function issueClaimCode(transaction: Transaction, linkId: string, hash: string, now: Date) {
  const [link] = await transaction.select().from(renterLinks).where(eq(renterLinks.id, linkId)).for('update')
  if (link === undefined || link.revokedAt !== null || link.expiresAt <= now || !link.scopes.includes('accept') || !link.scopes.includes('contest')) return { ok: false, reason: 'link_invalid' } as const
  const [claim] = await transaction.select().from(claims).where(eq(claims.rentalId, link.rentalId))
  if (claim === undefined) return { ok: false, reason: 'reply_expired' } as const
  const capture = (await transaction.select().from(executions).where(and(eq(executions.rentalId, link.rentalId), eq(executions.action, 'capture')))).some((row) => row.paypalResourceIds['claim'] === claim.id && row.paypalResourceIds['early'] === 'true')
  const replies = await transaction.select().from(claimReplies).where(eq(claimReplies.claimId, claim.id))
  if (!claimReplyAllowed(claim.state, claim.replyDueAt, now, capture, replies.length > 0)) return { ok: false, reason: 'reply_expired' } as const
  if (link.claimCodeExpiresAt !== null && link.claimCodeExpiresAt.getTime() - 540000 > now.getTime()) return { ok: false, reason: 'code_recently_sent' } as const
  const [payer] = await transaction.select({ email: renters.email, contactEmail: rentals.contactEmail }).from(rentals).innerJoin(renters, eq(renters.id, rentals.renterId)).where(eq(rentals.id, link.rentalId))
  if (payer === undefined) return { ok: false, reason: 'payer_missing' } as const
  // A shop with no account on record is treated as live: the stricter rule.
  const [account] = await transaction.select({ mode: paypalAccounts.mode }).from(paypalAccounts).where(eq(paypalAccounts.shopId, link.shopId)).orderBy(desc(paypalAccounts.createdAt)).limit(1)
  const recipient = claimCodeRecipient({ paypalMode: account?.mode === 'sandbox' ? 'sandbox' : 'live', payerEmail: payer.email, contactEmail: payer.contactEmail })
  await transaction.update(renterLinks).set({ claimCodeHash: hash, claimCodeExpiresAt: new Date(now.getTime() + 600000), claimCodeAttempts: 0 }).where(eq(renterLinks.id, linkId))
  return { ok: true, ...recipient } as const
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
