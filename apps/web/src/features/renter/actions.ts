'use server'

import { MISSED_VIEWS } from '@hold/domain'
import { MAX_PHOTO_BYTES } from '@hold/evidence'
import { z } from 'zod'
import { readLocale } from '@/features/auth/locale-input'
import { confirmFeePayment, startFeePayment } from '@/server/fee-payment'
import { confirmConditionReport, confirmMissedPhoto, requestMissedPhoto, sendMissedPhotos } from '@/server/condition-reply'
import { confirmHoldApproval, startHoldApproval } from '@/server/hold-approval'
import { renterAction, withToken } from '@/server/renter-access'

// What a renter does through their link. Each is built by renterAction, which checks the link, its scope and the
// network's rate before the work below runs, and writes the audit line after it. A test checks that this file exports
// nothing else. No amount comes from the renter: the fee is the one stored on the rental, the hold the one on its hold.

export const payFee = renterAction({ name: 'renter.fee_started', scope: 'pay', input: withToken({}) }, (link, input, inLinkShop) =>
  startFeePayment(link, inLinkShop, input.token, readLocale(input.locale)),
)

export const confirmFee = renterAction({ name: 'renter.fee_confirmed', scope: 'pay', input: withToken({ orderId: z.string().min(1).max(64) }) }, (link, input, inLinkShop) =>
  confirmFeePayment(link, inLinkShop, input.orderId),
)

export const approveHold = renterAction({ name: 'renter.hold_started', scope: 'pay', input: withToken({}) }, (link, input, inLinkShop) =>
  startHoldApproval(link, inLinkShop, input.token, readLocale(input.locale)),
)

export const confirmHold = renterAction({ name: 'renter.hold_confirmed', scope: 'pay', input: withToken({ orderId: z.string().min(1).max(64) }) }, (link, input, inLinkShop) =>
  confirmHoldApproval(link, inLinkShop, input.orderId),
)

// The condition report sent at handover. Only its link carries the scope to answer it.
export const confirmCondition = renterAction({ name: 'renter.condition_confirmed', scope: 'confirm_condition', input: withToken({}) }, (link, _input, inLinkShop) => confirmConditionReport(link, inLinkShop))

const missed = { itemId: z.uuid(), view: z.enum(MISSED_VIEWS) }

export const requestMissedUpload = renterAction(
  { name: 'renter.missed_upload_requested', scope: 'confirm_condition', input: withToken({ ...missed, sha256: z.string().regex(/^[0-9a-f]{64}$/), bytes: z.coerce.number().int().min(1).max(MAX_PHOTO_BYTES) }) },
  (link, input, inLinkShop) => requestMissedPhoto(link, inLinkShop, input),
)

export const confirmMissedUpload = renterAction(
  {
    name: 'renter.missed_photo_recorded',
    scope: 'confirm_condition',
    input: withToken({
      ...missed,
      key: z.string().min(1).max(300),
      sharpness: z.coerce.number().min(0).max(1_000_000),
      shadows: z.coerce.number().min(0).max(255),
      highlights: z.coerce.number().min(0).max(255),
      filled: z.coerce.number().min(0).max(1),
    }),
  },
  (link, input, inLinkShop) => confirmMissedPhoto(link, inLinkShop, { itemId: input.itemId, view: input.view, key: input.key, measures: { sharpness: input.sharpness, shadows: input.shadows, highlights: input.highlights, filled: input.filled } }),
)

export const sendMissed = renterAction({ name: 'renter.condition_added', scope: 'confirm_condition', input: withToken({}) }, (link, _input, inLinkShop) => sendMissedPhotos(link, inLinkShop))
