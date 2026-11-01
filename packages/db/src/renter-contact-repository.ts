import { timingSafeEqual } from 'node:crypto'
import { claimCodeRecipient, contactChangeNeedsCode, maskedPhone, PHONE_CODE, phoneNumber, textAllowed } from '@hold/domain'
import type { TextPurpose, TextStatus } from '@hold/domain'
import { and, asc, desc, eq } from 'drizzle-orm'
import { liveLink, storeRenterCode } from './claim-code-repository.ts'
import { shopPayPalMode } from './paypal-mode.ts'
import { rentals, renters, textMessages } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// How a renter is reached (architecture.md section 12.3): the phone they chose texts on, confirmed with a code texted to
// it, and each text Hold sent them. Nothing here sends: the caller sends the code this stores the digest of.

type Refused<Reason extends string> = { readonly ok: false; readonly reason: Reason }
const refused = <Reason extends string>(reason: Reason): Refused<Reason> => ({ ok: false, reason })
const MINUTE = 60_000

// Points the rental's texts at the number typed and stores the digest of the code that confirms it. Before the hold is
// placed the renter may do so freely; after, only once the caller has checked a code from the channel trusted now
// (`stepUp`). The number already confirmed needs no new code.
export async function requestPhoneCode(transaction: Transaction, rentalId: string, input: { readonly typed: string; readonly hash: string; readonly stepUp: boolean }, now: Date) {
  const phone = phoneNumber(input.typed)
  if (phone === undefined) return refused('phone_invalid')
  if (!textAllowed(phone)) return refused('country_not_texted')
  const [rental] = await transaction.select().from(rentals).where(eq(rentals.id, rentalId)).for('update')
  if (rental === undefined) return refused('not_found')
  if (rental.contactPhone === phone && rental.phoneConfirmedAt !== null) {
    await transaction.update(rentals).set({ contactChannel: 'text' }).where(eq(rentals.id, rentalId))
    return { ok: true, phone, confirmed: true } as const
  }
  if (contactChangeNeedsCode(rental.state) && !input.stepUp) return refused('code_needed')
  const sentAt = rental.phoneCodeExpiresAt === null ? null : rental.phoneCodeExpiresAt.getTime() - PHONE_CODE.minutes * MINUTE
  if (sentAt !== null && now.getTime() < sentAt + PHONE_CODE.resendSeconds * 1000) return refused('code_recently_sent')
  await transaction.update(rentals)
    .set({ contactChannel: 'text', contactPhone: phone, phoneConfirmedAt: null, phoneCodeHash: input.hash, phoneCodeExpiresAt: new Date(now.getTime() + PHONE_CODE.minutes * MINUTE), phoneCodeAttempts: 0 })
    .where(eq(rentals.id, rentalId))
  return { ok: true, phone, confirmed: false } as const
}

// Spends the code: right, the phone is confirmed and codes may go to it; wrong, it counts a try, and three end it.
export async function confirmPhone(transaction: Transaction, rentalId: string, hash: string, now: Date) {
  const [rental] = await transaction.select().from(rentals).where(eq(rentals.id, rentalId)).for('update')
  if (rental?.contactPhone == null || rental.phoneCodeHash === null || rental.phoneCodeExpiresAt === null || rental.phoneCodeExpiresAt <= now || rental.phoneCodeAttempts >= PHONE_CODE.attempts) return refused('code_expired')
  const expected = Buffer.from(rental.phoneCodeHash)
  const given = Buffer.from(hash)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    await transaction.update(rentals).set({ phoneCodeAttempts: rental.phoneCodeAttempts + 1 }).where(eq(rentals.id, rentalId))
    return refused('wrong_code')
  }
  await transaction.update(rentals).set({ phoneConfirmedAt: now, phoneCodeHash: null, phoneCodeExpiresAt: null }).where(eq(rentals.id, rentalId))
  return { ok: true, phone: rental.contactPhone } as const
}

// Back to email. The number stays, so choosing texts again needs no new code once it was confirmed.
export async function chooseEmail(transaction: Transaction, rentalId: string): Promise<void> {
  await transaction.update(rentals).set({ contactChannel: 'email' }).where(eq(rentals.id, rentalId))
}

type TextRecord = { readonly rentalId: string; readonly purpose: TextPurpose; readonly toPhone: string; readonly status: TextStatus; readonly providerMessageId: string | null; readonly body: string | null; readonly failure: string | null }

export async function recordText(transaction: Transaction, text: TextRecord, now: Date): Promise<void> {
  const [rental] = await transaction.select({ shopId: rentals.shopId }).from(rentals).where(eq(rentals.id, text.rentalId))
  if (rental === undefined) throw new Error('A text was recorded for a rental that is not there.')
  await transaction.insert(textMessages).values({ ...text, shopId: rental.shopId, createdAt: now })
}

// What AWS End User Messaging reports of a text sent: only once, from sent to what became of it.
export async function markTextStatus(transaction: Transaction, providerMessageId: string, report: { readonly status: 'delivered' | 'failed' | 'opted_out'; readonly failure: string | null }, at: Date): Promise<boolean> {
  const updated = await transaction.update(textMessages).set({ status: report.status, failure: report.failure, statusAt: at })
    .where(and(eq(textMessages.providerMessageId, providerMessageId), eq(textMessages.status, 'sent'))).returning({ id: textMessages.id })
  return updated.length > 0
}

// The texts a demo shop showed on the renter's page instead of sending them, oldest first.
export async function shownTexts(transaction: Transaction, rentalId: string) {
  return transaction.select({ id: textMessages.id, purpose: textMessages.purpose, body: textMessages.body, createdAt: textMessages.createdAt })
    .from(textMessages).where(and(eq(textMessages.rentalId, rentalId), eq(textMessages.status, 'simulated'))).orderBy(asc(textMessages.createdAt), asc(textMessages.id))
}

// A rental's texts for staff, newest first, each number masked.
export async function textsOf(transaction: Transaction, rentalId: string) {
  const rows = await transaction.select({ id: textMessages.id, purpose: textMessages.purpose, toPhone: textMessages.toPhone, status: textMessages.status, failure: textMessages.failure, createdAt: textMessages.createdAt, statusAt: textMessages.statusAt })
    .from(textMessages).where(eq(textMessages.rentalId, rentalId)).orderBy(desc(textMessages.createdAt), desc(textMessages.id))
  return rows.map((row) => ({ ...row, toPhone: maskedPhone(row.toPhone) }))
}

// Where a money decision made with a code a phone received is copied: the email PayPal gave for the payer, under that
// rule's sandbox exception, so a misused phone never goes unnoticed. Undefined when codes go to email anyway.
export async function decisionCopyRecipient(transaction: Transaction, rentalId: string) {
  const [row] = await transaction
    .select({ email: renters.email, contactEmail: rentals.contactEmail, channel: rentals.contactChannel, phone: rentals.contactPhone, confirmedAt: rentals.phoneConfirmedAt, shopId: rentals.shopId })
    .from(rentals).innerJoin(renters, eq(renters.id, rentals.renterId)).where(eq(rentals.id, rentalId))
  if (row === undefined || row.channel !== 'text' || row.confirmedAt === null) return undefined
  return claimCodeRecipient({ paypalMode: await shopPayPalMode(transaction, row.shopId), payerEmail: row.email, contactEmail: row.contactEmail })
}

// The code that lets a renter point their texts at a new number once the hold is placed. It goes where their codes go
// now, the confirmed phone or the email PayPal gave, so only the person trusted already can move them.
export async function issueContactChangeCode(transaction: Transaction, linkId: string, hash: string, now: Date) {
  const link = await liveLink(transaction, linkId, ['view'], now)
  if (link === undefined) return refused('link_invalid')
  return storeRenterCode(transaction, link, hash, now)
}

export type RentalText = Awaited<ReturnType<typeof textsOf>>[number]
