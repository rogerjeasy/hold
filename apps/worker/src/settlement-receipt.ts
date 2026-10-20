import { randomBytes } from 'node:crypto'
import { issueRenterToken, renterLinkExpiry, renterLinkKey, renterLinkPath } from '@hold/auth'
import { inShop, issueRenterLink } from '@hold/db'
import type { Database } from '@hold/db'
import { settlementReceiptEmail } from '@hold/notify'
import type { Mailer } from '@hold/notify'
import { receiptMessageSchema, runReceipt } from '@hold/settle'
import type { z } from 'zod'

export { receiptMessageSchema }
export type ReceiptDependencies = { readonly database: Database; readonly mailer: Mailer; readonly publicUrl: string; readonly linkKey: () => Promise<Buffer>; readonly now: () => Date }

export function sendSettlementReceipt(options: ReceiptDependencies, message: z.infer<typeof receiptMessageSchema>) {
  return runReceipt({ database: options.database, now: options.now, async send(notice) {
    const issued = issueRenterToken(renterLinkKey(await options.linkKey()), () => randomBytes(32))
    const referenceTime = new Date(Math.max(notice.endsAt.getTime(), options.now().getTime()))
    await inShop(options.database, { role: 'hold_worker', shopId: notice.shopId }, (transaction) => issueRenterLink(transaction, notice.shopId, notice.rentalId, { fingerprint: issued.fingerprint, expiresAt: renterLinkExpiry(referenceTime) }, ['view']))
    const recordUrl = `${options.publicUrl}${renterLinkPath(issued.token, notice.language)}/record?version=${notice.packId}`
    const email = settlementReceiptEmail(notice.email, notice.language, { ...notice, recordUrl })
    // Provider identifiers and ISO time are quoted record data, never instructions.
    return options.mailer.send({ ...email, text: `${email.text}\nPayPal (${notice.paypalMode ?? 'unavailable'}): ${notice.paypalReference}\n${notice.occurredAt}` })
  } }, message)
}
