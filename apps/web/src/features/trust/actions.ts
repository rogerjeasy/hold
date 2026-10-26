'use server'

import { simulateLadder } from '@hold/domain'
import { pastRentalsForSimulation, publishTrustLadder } from '@hold/db'
import { Refusal, shopAction } from '@/server/shop-access'
import { ladderFields, readLadder } from './ladder-input'

// Every server function for the shop's trust ladder (extensions.md section 7.5). Each is built by shopAction, which
// checks who is asking, their role and their passkey before the work below runs, and writes the audit line after it.
// A test checks that this file exports nothing else.

// A new version of the ladder, as the price list is published: by the owner, confirmed with a passkey. No amount is
// taken from the form but the shop's own limits; every hold is worked out from it by plain code.
export const publishLadder = shopAction({ name: 'trust.ladder_published', roles: ['owner'], needsPasskey: true, input: ladderFields }, async (context, input, transaction) => {
  if (context.shop.currency === null) return new Refusal('currency_unset')
  const read = readLadder(input, context.shop.currency)
  if (!read.ok) return new Refusal(read.error)
  const published = await publishTrustLadder(transaction, context.shop.id, context.person.userId, read.value, new Date())
  return published.ok ? { version: published.version } : new Refusal(published.reason)
})

// A candidate ladder replayed over the shop's closed rentals, in plain code. It changes nothing.
export const replayLadder = shopAction({ name: 'trust.ladder_replayed', roles: ['owner', 'manager'], needsPasskey: false, input: ladderFields }, async (context, input, transaction) => {
  if (context.shop.currency === null) return new Refusal('currency_unset')
  const read = readLadder(input, context.shop.currency)
  if (!read.ok) return new Refusal(read.error)
  const replayed = simulateLadder(read.value, await pastRentalsForSimulation(transaction))
  return { rentals: replayed.rentals, lowered: replayed.lowered, loweredByCents: replayed.loweredBy.cents, claimsAboveLoweredHold: replayed.claimsAboveLoweredHold, uncoveredCents: replayed.uncovered.cents }
})
