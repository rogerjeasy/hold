import 'server-only'
import { inShop, markPhotoMessageSent, MEDIA_QUEUE } from '@hold/db'
import { getServices } from './services'

// Hands a recorded photograph to the worker at once, so its display copy is ready while staff are still at the
// counter. Its outbox row is the fallback: if this fails, the relay sends it within a minute.
export async function sendMediaMessage(shopId: string, sessionId: string, photoId: string): Promise<void> {
  const { settle, database } = await getServices()
  await settle.send({ queue: MEDIA_QUEUE, group: sessionId, deduplicationId: `photo-${photoId}`, body: { shopId, photoId } })
  await inShop(database, { role: 'hold_app', shopId }, (transaction) => markPhotoMessageSent(transaction, photoId, new Date()))
}
