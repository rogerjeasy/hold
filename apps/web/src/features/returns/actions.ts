'use server'

import { auditLog, captureSession, comparisonReport, rentalDetail, rentalItemFor, rentalReturns, sealSession, startCaptureSession } from '@hold/db'
import { z } from 'zod'
import { Refusal, shopAction, withLocale } from '@/server/shop-access'
import { CAPTURE_STAFF, staffPhotoActions } from '@/server/staff-photo'
import { sendComparisons } from '@/server/comparison-queue'
import { reviewNote } from './review-input'

export const startReturn = shopAction(
  { name: 'return.started', roles: CAPTURE_STAFF, needsPasskey: false, input: withLocale({ rentalId: z.uuid(), itemId: z.uuid() }) },
  async (context, input, transaction) => {
    const rentalItemId = await rentalItemFor(transaction, input.rentalId, input.itemId)
    if (rentalItemId === undefined) return new Refusal('not_found')
    const started = await startCaptureSession(transaction, { rentalId: input.rentalId, rentalItemId, kind: 'return', actorUserId: context.person.userId }, new Date())
    return started.ok ? { sessionId: started.sessionId } : new Refusal(started.reason)
  },
)

const photos = staffPhotoActions('return')
export const requestPhotoUpload = photos.request
export const confirmPhotoUpload = photos.confirm

export const sealReturn = shopAction(
  { name: 'return.sealed', roles: CAPTURE_STAFF, needsPasskey: false, input: withLocale({ sessionId: z.uuid() }) },
  async (_context, input, transaction) => {
    const session = await captureSession(transaction, input.sessionId)
    if (session?.kind !== 'return') return new Refusal('not_found')
    const sealed = await sealSession(transaction, input.sessionId, new Date())
    if (!sealed.ok) return new Refusal(sealed.reason)
    const rental = await rentalDetail(transaction, session.rentalId, new Date())
    const returned = await rentalReturns(transaction, session.rentalId)
    return { rentalId: session.rentalId, rentalReturned: rental?.state === 'returned' || rental?.state === 'inspecting', comparisonId: returned.find((item) => item.sessionId === input.sessionId)?.comparisonId ?? null, comparisonIds: returned.flatMap((item) => item.comparisonId === null ? [] : [item.comparisonId]) }
  },
  (context, output) => sendComparisons(context.shop.id, output.rentalId, output.comparisonIds),
)

// Human observations remain append-only and separate from the model result. This records no approval and moves no
// rental, claim or money state. It is usable even when the model is unavailable.
export const recordReview = shopAction(
  { name: 'comparison.review_recorded', roles: CAPTURE_STAFF, needsPasskey: false, input: withLocale({ comparisonId: z.uuid(), ...reviewNote.shape }) },
  async (context, input, transaction) => {
    if (await comparisonReport(transaction, input.comparisonId) === undefined) return new Refusal('not_found')
    await transaction.insert(auditLog).values({ shopId: context.shop.id, actorKind: 'person', actorId: context.person.userId, action: 'comparison.manual_review', subjectKind: 'comparison', subjectId: input.comparisonId, detail: { outcome: input.outcome, reason: input.reason } })
    return {}
  },
)
