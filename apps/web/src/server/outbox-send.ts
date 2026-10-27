import 'server-only'
import { inShop, markOutboxSent, outboxWrittenAt } from '@hold/db'
import { outboxMessage } from '@hold/settle'
import { getServices } from './services'

// Sends at once what one committed change wrote to the outbox, at the moment it ran, and marks each sent. A send that
// fails leaves the rest to the relay, which sends them the same way.
export async function sendWrittenAt(shopId: string, at: Date): Promise<void> {
  const { database, settle } = await getServices()
  const scope = { role: 'hold_app', shopId } as const
  for (const message of await inShop(database, scope, (transaction) => outboxWrittenAt(transaction, at))) {
    await settle.send(outboxMessage(message))
    await inShop(database, scope, (transaction) => markOutboxSent(transaction, message.id, new Date()))
  }
}
