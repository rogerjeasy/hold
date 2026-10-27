import 'server-only'
import { inShop, markOutboxSent, NEGOTIATIONS_QUEUE } from '@hold/db'
import { getServices } from './services'

// Hands a negotiation to the advocates' worker once its opening is committed. Its outbox row was written with it, so
// a failed send only waits for the relay, which uses the same deduplication ID.
export async function sendNegotiation(shopId: string, rentalId: string, negotiationId: string, outboxId: string) {
  const { settle, database } = await getServices()
  await settle.send({ queue: NEGOTIATIONS_QUEUE, group: rentalId, deduplicationId: outboxId, body: { shopId, negotiationId } })
  await inShop(database, { role: 'hold_app', shopId }, (transaction) => markOutboxSent(transaction, outboxId, new Date()))
}
