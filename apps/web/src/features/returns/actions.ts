'use server'

import { auditLog, captureSession, comparisonReport, rentalDetail, rentalItemFor, rentalReturns, sealSession, startCaptureSession, startSampleComparison } from '@hold/db'
import { rentalItemInput, reviewInput, sessionInput } from '@hold/mobile-api'
import { z } from 'zod'
import { takeDailyShares } from '@/server/daily-shares'
import { Refusal, shopAction, withLocale } from '@/server/shop-access'
import { CAPTURE_STAFF, staffPhotoActions } from '@/server/staff-photo'
import { sendComparisons } from '@/server/comparison-queue'
import { sampleComparisonNetwork, sampleComparisonShares } from './limits'

export const startReturn = shopAction(
  { name: 'return.started', roles: CAPTURE_STAFF, needsPasskey: false, input: rentalItemInput },
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
  { name: 'return.sealed', roles: CAPTURE_STAFF, needsPasskey: false, input: sessionInput },
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
  { name: 'comparison.review_recorded', roles: CAPTURE_STAFF, needsPasskey: false, input: reviewInput },
  async (context, input, transaction) => {
    if (await comparisonReport(transaction, input.comparisonId) === undefined) return new Refusal('not_found')
    await transaction.insert(auditLog).values({ shopId: context.shop.id, actorKind: 'person', actorId: context.person.userId, action: 'comparison.manual_review', subjectKind: 'comparison', subjectId: input.comparisonId, detail: { outcome: input.outcome, reason: input.reason } })
    return {}
  },
)

// Hands the demo's sample return to the comparison worker, so Claude compares the demonstration's own photographs
// (architecture.md section 20.3). No passkey and any staff role: nothing here moves money, and a sample is never charged.
// The day's shares are taken in this transaction, where no model is called, so a refused start spends nothing.
export const compareSample = shopAction(
  { name: 'comparison.sample_started', roles: CAPTURE_STAFF, needsPasskey: false, input: withLocale({ rentalId: z.uuid() }) },
  async (context, input, transaction) => {
    const refused = await takeDailyShares(transaction, sampleComparisonShares(await sampleComparisonNetwork(), new Date()), { event: 'sample_comparison_refused', shopId: context.shop.id })
    if (refused !== null) return new Refusal(refused.refusal)
    const started = await startSampleComparison(transaction, input.rentalId, new Date())
    return started.ok ? { rentalId: started.rentalId, comparisonId: started.comparisonId } : new Refusal(started.reason)
  },
  (context, output) => sendComparisons(context.shop.id, output.rentalId, [output.comparisonId]),
)
