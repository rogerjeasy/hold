'use server'
import { acknowledgeClaimReview, auditLog, issueClaimCode, replyToClaim, useClaimCode } from '@hold/db'
import { z } from 'zod'
import { readLocale } from '@/features/auth/locale-input'
import { Refusal } from '@/server/action'
import { renterAction, withToken } from '@/server/renter-access'
import { CODE_PURPOSES, codeVia, newRenterCode, renterCodeDigest } from '@/server/renter-code'
import { copyDecisionToEmail } from '@/server/decision-copy'
import { deliverRenterCode } from '@/server/renter-code-delivery'
import { writeContestSummary } from '@/server/contest-summary'
import { sendSettlement } from '@/server/settlement-queue'

const digest = (linkId: string, code: string) => renterCodeDigest(CODE_PURPOSES.claimReply, linkId, code)
// The code goes where the renter chose, a confirmed phone or the email PayPal gave; `via: 'email'` asks for it by email.
export const sendClaimCode = renterAction({ name: 'renter.claim_code_requested', scope: 'accept', input: withToken({ via: codeVia }) }, async (link, input, inLinkShop) => {
  const code = await newRenterCode()
  const hash = await digest(link.id, code)
  const issued = await inLinkShop((transaction) => issueClaimCode(transaction, link.id, hash, new Date(), input.via))
  if (!issued.ok) return new Refusal(issued.reason)
  const delivered = await deliverRenterCode(inLinkShop, link, issued, { locale: readLocale(input.locale), code, kind: 'claimReply', emailWords: 'emails.claimCode' })
  if (delivered instanceof Refusal) return delivered
  // Simulated things say so, in the record too: the address itself stays out of it.
  if (delivered.sandboxContact) await inLinkShop((transaction) => transaction.insert(auditLog).values({ shopId: link.shopId, actorKind: 'renter', actorId: link.id, action: 'renter.claim_code_sandbox_contact', subjectKind: 'rental', subjectId: link.rentalId, detail: { sandbox: true } }))
  return delivered
})

function reply(decision: 'accept' | 'contest') {
  return renterAction({ name: `renter.claim_${decision}`, scope: decision, input: withToken({ code: z.string().regex(/^[0-9]{8}$/), comment: z.string().trim().max(1000).optional() }) }, async (link, input, inLinkShop) => {
    const hash = await digest(link.id, input.code)
    const result = await inLinkShop(async (transaction) => {
      const verified = await useClaimCode(transaction, link.id, hash, new Date())
      if (!verified.ok) return verified
      return replyToClaim(transaction, link.rentalId, decision, input.comment ?? '', new Date())
    })
    if (!result.ok) return new Refusal(result.reason)
    if (result.executionId !== null) {
      try { await sendSettlement(link.shopId, link.rentalId, result.executionId) } catch { /* The committed outbox retries delivery. */ }
    }
    if (decision === 'contest') await writeContestSummary(link.shopId, link.rentalId)
    await copyDecisionToEmail(inLinkShop, link, decision === 'accept' ? 'claim_accepted' : 'claim_contested', readLocale(input.locale))
    return {}
  })
}
export const acceptClaim = reply('accept')
export const contestClaim = reply('contest')

export const acknowledgeClaim = renterAction({ name: 'renter.claim_reviewed', scope: 'accept', input: withToken({}) }, async (link, _input, inLinkShop) => {
  const result = await inLinkShop((transaction) => acknowledgeClaimReview(transaction, link.rentalId, new Date()))
  return result.ok ? {} : new Refusal(result.reason)
})
