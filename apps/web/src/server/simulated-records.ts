import 'server-only'
import { inShop, issueRenterLink, markOutboxSent, pendingEvidenceWork } from '@hold/db'
import type { Database } from '@hold/db'
import { evidenceMessageSchema, makeEvidencePack } from '@hold/evidence'
import type { DocumentStore, EvidenceStore } from '@hold/evidence'
import { settlementReceiptEmail } from '@hold/notify'
import type { Mailer } from '@hold/notify'
import { receiptMessageSchema, runReceipt } from '@hold/settle'
import { newRenterLink, renterUrl } from './renter-links'

export function simulatedRecords(options: { database: Database; documents: DocumentStore; evidence: EvidenceStore; mailer: Mailer }) {
  const handle = async (queue: string, body: Readonly<Record<string, unknown>>) => {
    if (queue === 'evidence') await makeEvidencePack(options, evidenceMessageSchema.parse(body))
    if (queue === 'messages') await runReceipt({ database: options.database, now: () => new Date(), async send(notice) {
      const link = await newRenterLink(new Date(Math.max(notice.endsAt.getTime(), Date.now())))
      await inShop(options.database, { role: 'hold_worker', shopId: notice.shopId }, (transaction) => issueRenterLink(transaction, notice.shopId, notice.rentalId, link, ['view']))
      const recordUrl = `${await renterUrl(link.token, notice.language)}/record?version=${notice.packId}`
      const email = settlementReceiptEmail(notice.email, notice.language, { ...notice, recordUrl, simulated: true })
      return options.mailer.send({ ...email, text: `${email.text}\nPayPal (sandbox): ${notice.paypalReference}\n${notice.occurredAt}` })
    } }, receiptMessageSchema.parse(body))
  }
  return {
    handle,
    async flush(shopId: string) {
      const scope = { role: 'hold_worker', shopId } as const
      const attempted = new Set<string>()
      let failed = false
      // New receipt work appears only after its document is published. Bound the in-process demo work.
      for (let pass = 0; pass < 3; pass += 1) {
        const rows = await inShop(options.database, scope, pendingEvidenceWork)
        const waiting = rows.filter((row) => !attempted.has(row.id))
        if (waiting.length === 0) break
        for (const row of waiting) {
          attempted.add(row.id)
          try {
            await handle(row.queue, { shopId, ...row.payload })
            await inShop(options.database, scope, (transaction) => markOutboxSent(transaction, row.id, new Date()))
          } catch { failed = true }
        }
      }
      if (failed) throw new Error('Simulated record work remains queued')
    },
  }
}
