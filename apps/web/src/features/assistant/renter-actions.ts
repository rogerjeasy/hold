'use server'

import { revokeAssistant } from '@hold/db'
import { Refusal } from '@/server/action'
import { renterAction, renterInput } from '@/server/renter-access'

// What a renter does about their own assistant (extensions.md section 8.5). Built by renterAction, which checks the
// link, its scope and the network's rate first. Any link to the rental may disconnect it: stopping an assistant moves
// no money and can only take access away.

export const disconnectAssistant = renterAction({ name: 'renter.assistant_disconnected', scope: 'view', input: renterInput('disconnect-assistant') }, async (link, _input, inLinkShop) => {
  const revoked = await inLinkShop((transaction) => revokeAssistant(transaction, link.rentalId, new Date()))
  return revoked ? {} : new Refusal('not_connected')
})
