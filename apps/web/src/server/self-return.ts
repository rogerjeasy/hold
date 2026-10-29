import 'server-only'
import { randomUUID } from 'node:crypto'
import { captureSession, photoRepeatsEvidence, recordPhoto, rentalReturns, sendSelfReturn, startSelfReturn } from '@hold/db'
import type { RenterLink, Transaction } from '@hold/db'
import type { PhotoMeasures } from '@hold/domain'
import { MAX_PHOTO_BYTES } from '@hold/evidence'
import { Refusal } from './action'
import { sendComparisons } from './comparison-queue'
import { sendMediaMessage } from './media'
import type { InLinkShop } from './renter-access'
import { getServices } from './services'

// A renter's return with nobody at the counter (architecture.md section 6.13), through their link. The photographs go
// through the same signed-checksum upload as staff's; sending seals every item at once and queues the comparisons.
// Nothing here calls PayPal or charges anything: the hold waits for a person who has seen the item.

export async function startRenterReturn(link: RenterLink, inLinkShop: InLinkShop) {
  const started = await inLinkShop((transaction) => startSelfReturn(transaction, link.rentalId, new Date()))
  return started.ok ? { sessionIds: started.sessionIds } : new Refusal(started.reason)
}

// Only the renter's own return of this rental, not yet sent.
async function openSession(transaction: Transaction, link: RenterLink, sessionId: string): Promise<Refusal | undefined> {
  const session = await captureSession(transaction, sessionId)
  if (session?.kind !== 'return' || !session.byRenter || session.rentalId !== link.rentalId) return new Refusal('not_found')
  return session.sealedAt === null ? undefined : new Refusal('sealed')
}

export async function requestReturnPhoto(link: RenterLink, inLinkShop: InLinkShop, input: { readonly sessionId: string; readonly view: string; readonly sha256: string; readonly bytes: number }) {
  const { evidence } = await getServices()
  if (evidence === undefined) return new Refusal('storage_unavailable')
  const refused = await inLinkShop((transaction) => openSession(transaction, link, input.sessionId))
  if (refused !== undefined) return refused
  const key = `${link.shopId}/${input.sessionId}/${input.view}/${randomUUID()}.jpg`
  const upload = await evidence.uploadLink({ key, sha256: input.sha256, bytes: input.bytes })
  return { key, url: upload.url, headers: upload.headers }
}

// Records the photograph that reached the locked bucket, with the fingerprint the store computed and the server's time.
// One that repeats this item's evidence is refused while the renter can still take another. A sample is said to be one
// on screen and in the record, and proves nothing either way, so it is not checked.
export async function confirmReturnPhoto(link: RenterLink, inLinkShop: InLinkShop, input: { readonly sessionId: string; readonly view: string; readonly key: string; readonly measures: PhotoMeasures; readonly simulated: boolean }) {
  const { evidence } = await getServices()
  if (evidence === undefined) return new Refusal('storage_unavailable')
  if (!input.key.startsWith(`${link.shopId}/${input.sessionId}/${input.view}/`)) return new Refusal('key_mismatch')
  const stored = await evidence.stored(input.key)
  if (stored === undefined) return new Refusal('not_uploaded')
  if (stored.bytes > MAX_PHOTO_BYTES) return new Refusal('too_large')
  const recorded = await inLinkShop(async (transaction) => {
    const refused = await openSession(transaction, link, input.sessionId)
    if (refused !== undefined) return refused
    if (!input.simulated && await photoRepeatsEvidence(transaction, input.sessionId, stored.sha256)) return new Refusal('photo_reused')
    const photo = await recordPhoto(transaction, input.sessionId, { view: input.view, evidenceKey: input.key, sha256: stored.sha256, quality: input.measures, simulated: input.simulated }, new Date())
    return photo.ok ? photo : new Refusal(photo.reason)
  })
  if (recorded instanceof Refusal) return recorded
  try {
    await sendMediaMessage(link.shopId, input.sessionId, recorded.photoId)
  } catch {
    // Its outbox row hands it to the worker later.
  }
  return { photoId: recorded.photoId }
}

export async function sendRenterReturn(link: RenterLink, inLinkShop: InLinkShop) {
  const sent = await inLinkShop(async (transaction) => {
    const result = await sendSelfReturn(transaction, link.rentalId, new Date())
    return result.ok ? { comparisonIds: (await rentalReturns(transaction, link.rentalId)).flatMap((item) => (item.comparisonId === null ? [] : [item.comparisonId])) } : new Refusal(result.reason)
  })
  if (sent instanceof Refusal) return sent
  try {
    await sendComparisons(link.shopId, link.rentalId, sent.comparisonIds)
  } catch {
    // The sealing transaction wrote the outbox; the relay sends it.
  }
  return {}
}
