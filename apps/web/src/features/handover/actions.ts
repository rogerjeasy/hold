'use server'

import { addMark, captureSession, confirmMarks, rentalDetail, rentalItemFor, sealSession, startCaptureSession } from '@hold/db'
import { handoverMarkInput, knownMarksInput, rentalItemInput, sessionInput } from '@hold/mobile-api'
import { conditionLink } from '@/server/condition-link'
import { CAPTURE_STAFF, staffPhotoActions } from '@/server/staff-photo'
import { Refusal, shopAction } from '@/server/shop-access'

// Every server function of the guided handover (architecture.md section 11.2). Each is built by shopAction, which
// checks who is asking and their role before the work below runs, and writes the audit line after it. A test checks
// that this file exports nothing else. Photographs go from the phone straight to the locked evidence store; what is
// recorded is the fingerprint the store computed, never one the phone states.

const STAFF = CAPTURE_STAFF

export const startHandover = shopAction(
  { name: 'handover.started', roles: STAFF, needsPasskey: false, input: rentalItemInput },
  async (context, input, transaction) => {
    const rentalItemId = await rentalItemFor(transaction, input.rentalId, input.itemId)
    if (rentalItemId === undefined) return new Refusal('not_found')
    const started = await startCaptureSession(transaction, { rentalId: input.rentalId, rentalItemId, kind: 'handover', actorUserId: context.person.userId }, new Date())
    return started.ok ? { sessionId: started.sessionId } : new Refusal(started.reason)
  },
)

const photos = staffPhotoActions('handover')
export const requestPhotoUpload = photos.request
export const confirmPhotoUpload = photos.confirm

export const addHandoverMark = shopAction(
  {
    name: 'handover.mark_added',
    roles: STAFF,
    needsPasskey: false,
    input: handoverMarkInput,
  },
  async (_context, input, transaction) => {
    const session = await captureSession(transaction, input.sessionId)
    if (session?.kind !== 'handover') return new Refusal('not_found')
    const added = await addMark(transaction, input.sessionId, { view: input.view, region: { x: input.x, y: input.y, width: input.width, height: input.height }, description: input.description })
    return added.ok ? { markId: added.markId } : new Refusal(added.reason)
  },
)

// Staff say the item's known marks are still there.
export const confirmKnownMarks = shopAction(
  { name: 'handover.marks_confirmed', roles: STAFF, needsPasskey: false, input: knownMarksInput },
  async (_context, input, transaction) => {
    const session = await captureSession(transaction, input.sessionId)
    if (session?.kind !== 'handover') return new Refusal('not_found')
    const confirmed = await confirmMarks(transaction, input.sessionId, input.markId)
    return confirmed.ok ? {} : new Refusal(confirmed.reason)
  },
)

// Seals the item's photographs. Once every item is sealed the rental is out, and the renter is sent the condition
// report, which staff can also show as a code.
export const sealHandover = shopAction(
  { name: 'handover.sealed', roles: STAFF, needsPasskey: false, input: sessionInput },
  async (context, input, transaction) => {
    const session = await captureSession(transaction, input.sessionId)
    if (session?.kind !== 'handover') return new Refusal('not_found')
    const sealed = await sealSession(transaction, input.sessionId, new Date())
    if (!sealed.ok) return new Refusal(sealed.reason)
    if (!sealed.rentalOut) return { rentalOut: false, conditionLink: undefined }
    const rental = await rentalDetail(transaction, session.rentalId, new Date())
    if (rental === undefined) return new Refusal('not_found')
    return { rentalOut: true, conditionLink: await conditionLink(transaction, context.shop.id, context.shop.name, rental) }
  },
)
