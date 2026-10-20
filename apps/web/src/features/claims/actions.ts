'use server'
import { approveClaim, confirmCleanReturn, decideClaim, draftClaim, issueRenterLink, rentalDetail } from '@hold/db'
import { z } from 'zod'
import { readLocale } from '@/features/auth/locale-input'
import { newRenterLink, renterUrl } from '@/server/renter-links'
import { qrSvg } from '@/server/qr'
import { Refusal, shopAction, withLocale } from '@/server/shop-access'
import { sendSettlement } from '@/server/settlement-queue'
import { claimLinesInput, claimReason } from './claim-input'

const STAFF = ['owner', 'manager', 'counter_staff'] as const
export const prepareClaim = shopAction({ name: 'claim.prepared', roles: STAFF, needsPasskey: false, input: withLocale({ rentalId: z.uuid(), lines: claimLinesInput }) }, async (context, input, transaction) => {
  const result = await draftClaim(transaction, input.rentalId, context.person.userId, input.lines, new Date())
  return result.ok ? { claimId: result.claimId } : new Refusal(result.reason)
})
export const approveAndPresent = shopAction({ name: 'claim.approved', roles: STAFF, needsPasskey: true, input: withLocale({ claimId: z.uuid() }) }, async (context, input, transaction) => {
  const now = new Date()
  const approved = await approveClaim(transaction, input.claimId, context.person.userId, now)
  if (!approved.ok) return new Refusal(approved.reason)
  const rental = await rentalDetail(transaction, approved.rentalId, now)
  if (rental === undefined) return new Refusal('not_found')
  const link = await newRenterLink(rental.endsAt)
  await issueRenterLink(transaction, context.shop.id, rental.id, link, ['view', 'accept', 'contest'])
  const url = `${await renterUrl(link.token, readLocale(rental.language))}/claim`
  return { rentalId: rental.id, url, qr: await qrSvg(url) }
})
export const confirmClean = shopAction({ name: 'return.release_approved', roles: STAFF, needsPasskey: true, input: withLocale({ rentalId: z.uuid(), reason: claimReason }) }, async (context, input, transaction) => {
  const result = await confirmCleanReturn(transaction, input.rentalId, context.person.userId, input.reason, new Date())
  return result.ok ? result : new Refusal(result.reason)
}, (context, result) => sendSettlement(context.shop.id, result.rentalId, result.executionId))
export const decide = shopAction({ name: 'claim.decided', roles: STAFF, needsPasskey: true, input: withLocale({ claimId: z.uuid(), decision: z.enum(['uphold', 'waive']), reason: claimReason }) }, async (context, input, transaction) => {
  const result = await decideClaim(transaction, input.claimId, context.person.userId, input.decision, input.reason, new Date())
  return result.ok ? result : new Refusal(result.reason)
}, (context, result) => sendSettlement(context.shop.id, result.rentalId, result.executionId))
