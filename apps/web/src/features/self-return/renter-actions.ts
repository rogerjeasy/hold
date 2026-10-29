'use server'

import { MAX_PHOTO_BYTES } from '@hold/evidence'
import { z } from 'zod'
import { renterAction, withToken } from '@/server/renter-access'
import { confirmReturnPhoto, requestReturnPhoto, sendRenterReturn, startRenterReturn } from '@/server/self-return'

// What a renter does to return the item with nobody at the counter (architecture.md section 6.13). Each is built by
// renterAction, which checks the link, its return_item scope and the network's rate first. None takes an amount, and
// none moves money: the hold stays until a person has seen the item.

const photo = { sessionId: z.uuid(), view: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/) }

export const startSelfReturn = renterAction({ name: 'renter.self_return_started', scope: 'return_item', input: withToken({}) }, (link, _input, inLinkShop) => startRenterReturn(link, inLinkShop))

export const requestSelfReturnUpload = renterAction(
  { name: 'renter.self_return_upload_requested', scope: 'return_item', input: withToken({ ...photo, sha256: z.string().regex(/^[0-9a-f]{64}$/), bytes: z.coerce.number().int().min(1).max(MAX_PHOTO_BYTES) }) },
  (link, input, inLinkShop) => requestReturnPhoto(link, inLinkShop, input),
)

export const confirmSelfReturnUpload = renterAction(
  {
    name: 'renter.self_return_photo_recorded',
    scope: 'return_item',
    input: withToken({ ...photo, key: z.string().min(1).max(300), sharpness: z.coerce.number().min(0).max(1_000_000), shadows: z.coerce.number().min(0).max(255), highlights: z.coerce.number().min(0).max(255), filled: z.coerce.number().min(0).max(1), simulated: z.literal('true').optional() }),
  },
  (link, input, inLinkShop) => confirmReturnPhoto(link, inLinkShop, { sessionId: input.sessionId, view: input.view, key: input.key, simulated: input.simulated === 'true', measures: { sharpness: input.sharpness, shadows: input.shadows, highlights: input.highlights, filled: input.filled } }),
)

export const sendSelfReturn = renterAction({ name: 'renter.self_return_sent', scope: 'return_item', input: withToken({}) }, (link, _input, inLinkShop) => sendRenterReturn(link, inLinkShop))
