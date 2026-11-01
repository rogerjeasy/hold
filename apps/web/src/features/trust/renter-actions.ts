'use server'

import { createHmac, randomInt } from 'node:crypto'
import { answerTrustConsent, auditLog, deleteTrustRecord, issueTrustCode, renterTrustKey, useTrustCode } from '@hold/db'
import type { Transaction } from '@hold/db'
import { z } from 'zod'
import { readLocale } from '@/features/auth/locale-input'
import { Refusal } from '@/server/action'
import { renterAction, withToken } from '@/server/renter-access'
import { codeVia } from '@/server/renter-code'
import { deliverRenterCode } from '@/server/renter-code-delivery'
import { getServices, TEST_SIGN_IN_CODE } from '@/server/services'

// What a renter does with their Clean Record through any of their links (extensions.md section 7.6). Each is built by
// renterAction, which checks the link, its scope and the network's rate before the work below runs, and writes the
// audit line after it. A test checks that this file exports nothing else. Neither moves money.
//
// Staff open view links at the counter, so consenting, withdrawing and deleting each need a one-time code sent to the
// address PayPal gave for the payer: proof the renter is present, as a claim reply needs.

const digest = (key: Buffer, linkId: string, code: string) => createHmac('sha256', key).update(`trust:${linkId}:${code}`).digest('hex')
const withCode = <Shape extends z.ZodRawShape>(shape: Shape) => withToken({ ...shape, code: z.string().regex(/^[0-9]{8}$/) })

export const sendTrustCode = renterAction({ name: 'trust.code_requested', scope: 'view', input: withToken({ via: codeVia }) }, async (link, input, inLinkShop) => {
  const services = await getServices()
  const code = services.config.services === 'fake' ? TEST_SIGN_IN_CODE : String(randomInt(0, 100000000)).padStart(8, '0')
  const issued = await inLinkShop((transaction) => issueTrustCode(transaction, link.id, digest(services.renterLinkKey, link.id, code), new Date(), input.via))
  if (!issued.ok) return new Refusal(issued.reason)
  const delivered = await deliverRenterCode(inLinkShop, link, issued, { locale: readLocale(input.locale), code, kind: 'trust', emailWords: 'emails.trustCode' })
  if (delivered instanceof Refusal) return delivered
  // Simulated things say so, in the record too: the address itself stays out of it.
  if (delivered.sandboxContact) await inLinkShop((transaction) => transaction.insert(auditLog).values({ shopId: link.shopId, actorKind: 'renter', actorId: link.id, action: 'trust.code_sandbox_contact', subjectKind: 'rental', subjectId: link.rentalId, detail: { sandbox: true } }))
  return delivered
})

// Spends the code, then finds the renter key of whoever PayPal says paid the rental's fee, kept on them so their
// record can be found. A refusal undoes nothing the renter could see, and a wrong code still counts as a try.
async function provenRenter(transaction: Transaction, link: { readonly id: string; readonly rentalId: string }, code: string): Promise<string | Refusal> {
  const services = await getServices()
  const used = await useTrustCode(transaction, link.id, digest(services.renterLinkKey, link.id, code), new Date())
  if (!used.ok) return new Refusal(used.reason)
  return (await renterTrustKey(transaction, link.rentalId, services.trust.renterKey)) ?? new Refusal('renter_unknown')
}

// Asked once, in a sentence, and off until the renter turns it on. They may change their answer at any time.
export const answerConsent = renterAction({ name: 'trust.consent_answered', scope: 'view', input: withCode({ consent: z.enum(['yes', 'no']) }) }, (link, input, inLinkShop) =>
  inLinkShop(async (transaction) => {
    const key = await provenRenter(transaction, link, input.code)
    if (key instanceof Refusal) return key
    const consented = input.consent === 'yes'
    return (await answerTrustConsent(transaction, key, consented, new Date())) ? { consented } : new Refusal('renter_unknown')
  }),
)

// Deleting the record returns the renter to the ordinary hold everywhere.
export const deleteRecord = renterAction({ name: 'trust.record_deleted', scope: 'view', input: withCode({ understood: z.literal('yes') }) }, (link, input, inLinkShop) =>
  inLinkShop(async (transaction) => {
    const key = await provenRenter(transaction, link, input.code)
    if (key instanceof Refusal) return key
    const removed = await deleteTrustRecord(transaction, key, new Date())
    return removed === undefined ? new Refusal('renter_unknown') : { removed }
  }),
)
