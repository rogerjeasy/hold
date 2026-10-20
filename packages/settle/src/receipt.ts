import { randomUUID } from 'node:crypto'
import { evidencePackFor, finishReceipt, inShop, leaseReceipt } from '@hold/db'
import type { Database, Transaction } from '@hold/db'
import { money } from '@hold/domain'
import type { Money } from '@hold/domain'
import { z } from 'zod'

export const receiptMessageSchema = z.strictObject({ shopId: z.uuid(), receiptId: z.uuid() })
export type ReceiptNotice = {
  readonly shopId: string; readonly rentalId: string; readonly packId: string; readonly endsAt: Date;
  readonly email: string; readonly language: 'en' | 'fr' | 'de' | 'es'; readonly shopName: string;
  readonly rentalReference: string; readonly version: number; readonly simulated: boolean;
  readonly kind: NonNullable<Awaited<ReturnType<typeof leaseReceipt>>>['kind'];
  readonly amount: Money; readonly releasedCents: number; readonly final: boolean;
  readonly paypalMode: 'sandbox' | 'live' | null; readonly paypalReference: string; readonly occurredAt: string;
}

// Transport and link signing are ports shared by the worker and the simulated web app.
export async function runReceipt(options: { readonly database: Database; readonly now: () => Date; readonly send: (notice: ReceiptNotice) => Promise<boolean> }, input: z.infer<typeof receiptMessageSchema>): Promise<'sent' | 'nothing_to_do'> {
  const message = receiptMessageSchema.parse(input)
  const scope = { role: 'hold_worker', shopId: message.shopId } as const
  const act = <Result>(work: (transaction: Transaction) => Promise<Result>) => inShop(options.database, scope, work)
  const owner = randomUUID()
  const delivery = await act((transaction) => leaseReceipt(transaction, message.receiptId, owner, options.now()))
  if (delivery === undefined) return 'nothing_to_do'
  let failure: 'email_unavailable' | 'contact_missing' = 'email_unavailable'
  try {
    if (delivery.email === null) { failure = 'contact_missing'; throw new Error(failure) }
    const pack = await act((transaction) => evidencePackFor(transaction, delivery.rentalId, delivery.packId))
    if (pack?.state !== 'ready') throw new Error('record_unavailable')
    const sent = await options.send({ shopId: message.shopId, rentalId: delivery.rentalId, packId: pack.id, endsAt: new Date(pack.snapshot.rental.endsAt), email: delivery.email, language: pack.snapshot.rental.language, shopName: pack.snapshot.shop.name, rentalReference: delivery.rentalId, version: pack.version, simulated: pack.snapshot.rental.simulated, kind: delivery.kind, amount: money(delivery.amountCents, delivery.currency), releasedCents: delivery.releasedCents, final: pack.snapshot.rental.state === 'closed' && delivery.kind !== 'invoice_sent', paypalMode: pack.snapshot.paypalMode, paypalReference: delivery.paypalReference, occurredAt: pack.snapshot.payments.find((payment) => payment.id === delivery.eventId)?.occurredAt ?? '' })
    if (!sent) throw new Error('email_unavailable')
    if (!await act((transaction) => finishReceipt(transaction, delivery.id, owner, true, options.now()))) throw new Error('delivery_lease_lost')
    return 'sent'
  } catch {
    await act((transaction) => finishReceipt(transaction, delivery.id, owner, false, options.now(), failure))
    throw new Error(failure)
  }
}
