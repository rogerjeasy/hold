import { inShop, markOutboxSent, pendingOutbox } from '@hold/db'
import type { SettleDependencies } from './dependencies.ts'

// Sends what waits in the outbox to its queue (architecture.md section 7.6), oldest first, and marks each sent only
// once its queue took it. A message for an execution or an event is deduplicated by what it names, so a message also
// sent at once by the request that wrote it is handled once.
export async function relayOutbox(dependencies: SettleDependencies, max: number): Promise<number> {
  const waiting = await pendingOutbox(dependencies.database, max)
  for (const message of waiting) {
    const named = message.payload['executionId'] ?? message.payload['eventId']
    await dependencies.send({
      queue: message.queue,
      group: message.messageGroup,
      deduplicationId: typeof named === 'string' ? `${message.payload['executionId'] === undefined ? 'event' : 'execution'}-${named}` : message.id,
      body: { shopId: message.shopId, ...message.payload },
    })
    await inShop(dependencies.database, { role: 'hold_worker', shopId: message.shopId }, (transaction) => markOutboxSent(transaction, message.id, dependencies.now()))
  }
  return waiting.length
}
