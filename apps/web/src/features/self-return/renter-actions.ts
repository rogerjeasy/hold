'use server'

import { renterAction, renterInput } from '@/server/renter-access'
import { confirmReturnPhoto, requestReturnPhoto, sendRenterReturn, startRenterReturn } from '@/server/self-return'

// What a renter does to return the item with nobody at the counter (architecture.md section 6.13). Each is built by
// renterAction, which checks the link, its return_item scope and the network's rate first. None takes an amount, and
// none moves money: the hold stays until a person has seen the item.

export const startSelfReturn = renterAction({ name: 'renter.self_return_started', scope: 'return_item', input: renterInput('start-self-return') }, (link, _input, inLinkShop) => startRenterReturn(link, inLinkShop))

export const requestSelfReturnUpload = renterAction(
  { name: 'renter.self_return_upload_requested', scope: 'return_item', input: renterInput('request-self-return-upload') },
  (link, input, inLinkShop) => requestReturnPhoto(link, inLinkShop, input),
)

export const confirmSelfReturnUpload = renterAction(
  {
    name: 'renter.self_return_photo_recorded',
    scope: 'return_item',
    input: renterInput('confirm-self-return-upload'),
  },
  (link, input, inLinkShop) => confirmReturnPhoto(link, inLinkShop, { sessionId: input.sessionId, view: input.view, key: input.key, measures: { sharpness: input.sharpness, shadows: input.shadows, highlights: input.highlights, filled: input.filled } }),
)

export const sendSelfReturn = renterAction({ name: 'renter.self_return_sent', scope: 'return_item', input: renterInput('send-self-return') }, (link, _input, inLinkShop) => sendRenterReturn(link, inLinkShop))
