'use server'

import { randomUUID } from 'node:crypto'
import { addMark, captureSession, confirmMarks, recordPhoto, rentalDetail, rentalItemFor, sealSession, startCaptureSession } from '@hold/db'
import { MAX_PHOTO_BYTES } from '@hold/evidence'
import { z } from 'zod'
import { conditionLink } from '@/server/condition-link'
import { sendMediaMessage } from '@/server/media'
import { getServices } from '@/server/services'
import { list, Refusal, shopAction, withLocale } from '@/server/shop-access'

// Every server function of the guided handover (architecture.md section 11.2). Each is built by shopAction, which
// checks who is asking and their role before the work below runs, and writes the audit line after it. A test checks
// that this file exports nothing else. Photographs go from the phone straight to the locked evidence store; what is
// recorded is the fingerprint the store computed, never one the phone states.

const STAFF = ['owner', 'manager', 'counter_staff'] as const

export const startHandover = shopAction(
  { name: 'handover.started', roles: STAFF, needsPasskey: false, input: withLocale({ rentalId: z.uuid(), itemId: z.uuid() }) },
  async (context, input, transaction) => {
    const rentalItemId = await rentalItemFor(transaction, input.rentalId, input.itemId)
    if (rentalItemId === undefined) return new Refusal('not_found')
    const started = await startCaptureSession(transaction, { rentalId: input.rentalId, rentalItemId, kind: 'handover', actorUserId: context.person.userId }, new Date())
    return started.ok ? { sessionId: started.sessionId } : new Refusal(started.reason)
  },
)

const photoFields = { sessionId: z.uuid(), view: z.string().min(1).max(64) }

// Where the phone puts one photograph: a key under this shop, session and view, and a short-lived link that the store
// accepts only with this exact SHA-256 and size.
export const requestPhotoUpload = shopAction(
  {
    name: 'handover.upload_requested',
    roles: STAFF,
    needsPasskey: false,
    input: withLocale({ ...photoFields, sha256: z.string().regex(/^[0-9a-f]{64}$/), bytes: z.coerce.number().int().min(1).max(MAX_PHOTO_BYTES) }),
  },
  async (context, input, transaction) => {
    const { evidence } = await getServices()
    if (evidence === undefined) return new Refusal('storage_unavailable')
    const session = await captureSession(transaction, input.sessionId)
    if (session === undefined) return new Refusal('not_found')
    if (session.sealedAt !== null) return new Refusal('sealed')
    if (!session.plan.some((view) => view.key === input.view)) return new Refusal('unknown_view')
    const key = `${context.shop.id}/${input.sessionId}/${input.view}/${randomUUID()}.jpg`
    const link = await evidence.uploadLink({ key, sha256: input.sha256, bytes: input.bytes })
    return { key, url: link.url, headers: link.headers }
  },
)

// The phone says the photograph is stored. The store is asked what arrived, and that fingerprint is what is recorded.
export const confirmPhotoUpload = shopAction(
  {
    name: 'handover.photo_recorded',
    roles: STAFF,
    needsPasskey: false,
    input: withLocale({
      ...photoFields,
      key: z.string().min(1).max(300),
      sharpness: z.coerce.number().min(0).max(1_000_000),
      shadows: z.coerce.number().min(0).max(255),
      highlights: z.coerce.number().min(0).max(255),
      filled: z.coerce.number().min(0).max(1),
    }),
  },
  async (context, input, transaction) => {
    const { evidence } = await getServices()
    if (evidence === undefined) return new Refusal('storage_unavailable')
    if (!input.key.startsWith(`${context.shop.id}/${input.sessionId}/${input.view}/`)) return new Refusal('key_mismatch')
    const stored = await evidence.stored(input.key)
    if (stored === undefined) return new Refusal('not_uploaded')
    if (stored.bytes > MAX_PHOTO_BYTES) return new Refusal('too_large')
    const recorded = await recordPhoto(
      transaction,
      input.sessionId,
      { view: input.view, evidenceKey: input.key, sha256: stored.sha256, quality: { sharpness: input.sharpness, shadows: input.shadows, highlights: input.highlights, filled: input.filled } },
      new Date(),
    )
    return recorded.ok ? { photoId: recorded.photoId, sessionId: input.sessionId } : new Refusal(recorded.reason)
  },
  (context, output) => sendMediaMessage(context.shop.id, output.sessionId, output.photoId),
)

const fraction = z.coerce.number().min(0).max(1)

export const addHandoverMark = shopAction(
  {
    name: 'handover.mark_added',
    roles: STAFF,
    needsPasskey: false,
    input: withLocale({ ...photoFields, x: fraction, y: fraction, width: fraction, height: fraction, description: z.string().max(200) }),
  },
  async (_context, input, transaction) => {
    const added = await addMark(transaction, input.sessionId, { view: input.view, region: { x: input.x, y: input.y, width: input.width, height: input.height }, description: input.description })
    return added.ok ? { markId: added.markId } : new Refusal(added.reason)
  },
)

// Staff say the item's known marks are still there.
export const confirmKnownMarks = shopAction(
  { name: 'handover.marks_confirmed', roles: STAFF, needsPasskey: false, input: withLocale({ sessionId: z.uuid(), markId: list(z.uuid()) }) },
  async (_context, input, transaction) => {
    const confirmed = await confirmMarks(transaction, input.sessionId, input.markId)
    return confirmed.ok ? {} : new Refusal(confirmed.reason)
  },
)

// Seals the item's photographs. Once every item is sealed the rental is out, and the renter is sent the condition
// report, which staff can also show as a code.
export const sealHandover = shopAction(
  { name: 'handover.sealed', roles: STAFF, needsPasskey: false, input: withLocale({ sessionId: z.uuid() }) },
  async (context, input, transaction) => {
    const session = await captureSession(transaction, input.sessionId)
    if (session === undefined) return new Refusal('not_found')
    const sealed = await sealSession(transaction, input.sessionId, new Date())
    if (!sealed.ok) return new Refusal(sealed.reason)
    if (!sealed.rentalOut) return { rentalOut: false, conditionLink: undefined }
    const rental = await rentalDetail(transaction, session.rentalId, new Date())
    if (rental === undefined) return new Refusal('not_found')
    return { rentalOut: true, conditionLink: await conditionLink(transaction, context.shop.id, context.shop.name, rental) }
  },
)
