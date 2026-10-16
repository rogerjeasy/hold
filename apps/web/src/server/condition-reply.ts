import 'server-only'
import { randomUUID } from 'node:crypto'
import { openConditionSessions, recordPhoto, rentalItemFor, replyToCondition, sealSession, startCaptureSession } from '@hold/db'
import type { RenterLink } from '@hold/db'
import type { PhotoMeasures } from '@hold/domain'
import { Refusal } from './action'
import { sendMediaMessage } from './media'
import type { InLinkShop } from './renter-access'
import { getServices } from './services'

// The renter's answer to the condition report (architecture.md section 11.2): everything is as shown, or here is a
// photograph of what staff missed. What they add goes into a condition session of its own, locked and chained like
// any other, so nobody can later say it was not there when it left.

export async function confirmConditionReport(link: RenterLink, inLinkShop: InLinkShop): Promise<Record<string, never> | Refusal> {
  const replied = await inLinkShop((transaction) => replyToCondition(transaction, link.rentalId, { kind: 'confirmed' }, new Date()))
  return replied.ok ? {} : new Refusal(replied.reason)
}

async function conditionSession(link: RenterLink, inLinkShop: InLinkShop, itemId: string): Promise<string | Refusal> {
  return inLinkShop(async (transaction) => {
    const rentalItemId = await rentalItemFor(transaction, link.rentalId, itemId)
    if (rentalItemId === undefined) return new Refusal('not_found')
    const started = await startCaptureSession(transaction, { rentalId: link.rentalId, rentalItemId, kind: 'condition', actorUserId: null }, new Date())
    return started.ok ? started.sessionId : new Refusal(started.reason === 'not_ready' ? 'closed' : started.reason)
  })
}

export async function requestMissedPhoto(link: RenterLink, inLinkShop: InLinkShop, input: { readonly itemId: string; readonly view: string; readonly sha256: string; readonly bytes: number }) {
  const { evidence } = await getServices()
  if (evidence === undefined) return new Refusal('storage_unavailable')
  const sessionId = await conditionSession(link, inLinkShop, input.itemId)
  if (sessionId instanceof Refusal) return sessionId
  const key = `${link.shopId}/${sessionId}/${input.view}/${randomUUID()}.jpg`
  const upload = await evidence.uploadLink({ key, sha256: input.sha256, bytes: input.bytes })
  return { key, url: upload.url, headers: upload.headers }
}

export async function confirmMissedPhoto(link: RenterLink, inLinkShop: InLinkShop, input: { readonly itemId: string; readonly view: string; readonly key: string; readonly measures: PhotoMeasures }) {
  const { evidence } = await getServices()
  if (evidence === undefined) return new Refusal('storage_unavailable')
  const sessionId = await conditionSession(link, inLinkShop, input.itemId)
  if (sessionId instanceof Refusal) return sessionId
  if (!input.key.startsWith(`${link.shopId}/${sessionId}/${input.view}/`)) return new Refusal('key_mismatch')
  const stored = await evidence.stored(input.key)
  if (stored === undefined) return new Refusal('not_uploaded')
  const recorded = await inLinkShop((transaction) => recordPhoto(transaction, sessionId, { view: input.view, evidenceKey: input.key, sha256: stored.sha256, quality: input.measures }, new Date()))
  if (!recorded.ok) return new Refusal(recorded.reason)
  try {
    await sendMediaMessage(link.shopId, sessionId, recorded.photoId)
  } catch {
    // Its outbox row hands it to the worker later.
  }
  return { photoId: recorded.photoId }
}

// Seals what the renter added and records that they added to the report.
export async function sendMissedPhotos(link: RenterLink, inLinkShop: InLinkShop): Promise<Record<string, never> | Refusal> {
  return inLinkShop(async (transaction) => {
    for (const sessionId of await openConditionSessions(transaction, link.rentalId)) await sealSession(transaction, sessionId, new Date())
    const replied = await replyToCondition(transaction, link.rentalId, { kind: 'added' }, new Date())
    return replied.ok ? {} : new Refusal(replied.reason)
  })
}
