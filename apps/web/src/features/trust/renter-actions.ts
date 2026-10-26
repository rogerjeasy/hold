'use server'

import { answerTrustConsent, deleteTrustRecord, renterTrustKey } from '@hold/db'
import { z } from 'zod'
import { Refusal } from '@/server/action'
import { renterAction, withToken } from '@/server/renter-access'
import { getServices } from '@/server/services'

// What a renter does with their Clean Record through any of their links (extensions.md section 7.6). Each is built by
// renterAction, which checks the link, its scope and the network's rate before the work below runs, and writes the
// audit line after it. A test checks that this file exports nothing else. Neither moves money.

// The renter key of whoever PayPal says paid the rental's fee, kept on them so their record can be found.
async function keyOf(rentalId: string, transaction: Parameters<typeof renterTrustKey>[0]): Promise<string | undefined> {
  return renterTrustKey(transaction, rentalId, (await getServices()).trust.renterKey)
}

// Asked once, in a sentence, and off until the renter turns it on. They may change their answer at any time.
export const answerConsent = renterAction({ name: 'trust.consent_answered', scope: 'view', input: withToken({ consent: z.enum(['yes', 'no']) }) }, (link, input, inLinkShop) =>
  inLinkShop(async (transaction) => {
    const key = await keyOf(link.rentalId, transaction)
    if (key === undefined) return new Refusal('renter_unknown')
    const consented = input.consent === 'yes'
    return (await answerTrustConsent(transaction, key, consented, new Date())) ? { consented } : new Refusal('renter_unknown')
  }),
)

// Deleting the record returns the renter to the ordinary hold everywhere.
export const deleteRecord = renterAction({ name: 'trust.record_deleted', scope: 'view', input: withToken({ understood: z.literal('yes') }) }, (link, _input, inLinkShop) =>
  inLinkShop(async (transaction) => {
    const key = await keyOf(link.rentalId, transaction)
    if (key === undefined) return new Refusal('renter_unknown')
    const removed = await deleteTrustRecord(transaction, key, new Date())
    return removed === undefined ? new Refusal('renter_unknown') : { removed }
  }),
)
