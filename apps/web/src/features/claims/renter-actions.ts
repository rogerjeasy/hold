'use server'
import { acknowledgeClaimReview, auditLog, issueClaimCode, replyToClaim, useClaimCode } from '@hold/db'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { readLocale } from '@/features/auth/locale-input'
import { Refusal } from '@/server/action'
import { renterAction, withToken } from '@/server/renter-access'
import { CODE_PURPOSES, newRenterCode, renterCodeDigest } from '@/server/renter-code'
import { getServices } from '@/server/services'
import { writeContestSummary } from '@/server/contest-summary'
import { sendSettlement } from '@/server/settlement-queue'

const digest = (linkId: string, code: string) => renterCodeDigest(CODE_PURPOSES.claimReply, linkId, code)
export const sendClaimCode = renterAction({ name: 'renter.claim_code_requested', scope: 'accept', input: withToken({}) }, async (link, input, inLinkShop) => {
  const services = await getServices()
  const code = await newRenterCode()
  const hash = await digest(link.id, code)
  const issued = await inLinkShop((transaction) => issueClaimCode(transaction, link.id, hash, new Date()))
  if (!issued.ok) return new Refusal(issued.reason)
  const t = await getTranslations({ locale: readLocale(input.locale), namespace: 'emails.claimCode' })
  if (!await services.mailer.send({ to: issued.email, subject: t('subject'), text: t('body', { code }) })) return new Refusal('email_unavailable')
  // Simulated things say so, in the record too: the address itself stays out of it.
  if (issued.sandboxContact) await inLinkShop((transaction) => transaction.insert(auditLog).values({ shopId: link.shopId, actorKind: 'renter', actorId: link.id, action: 'renter.claim_code_sandbox_contact', subjectKind: 'rental', subjectId: link.rentalId, detail: { sandbox: true } }))
  return { sandboxContact: issued.sandboxContact }
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
    return {}
  })
}
export const acceptClaim = reply('accept')
export const contestClaim = reply('contest')

export const acknowledgeClaim = renterAction({ name: 'renter.claim_reviewed', scope: 'accept', input: withToken({}) }, async (link, _input, inLinkShop) => {
  const result = await inLinkShop((transaction) => acknowledgeClaimReview(transaction, link.rentalId, new Date()))
  return result.ok ? {} : new Refusal(result.reason)
})
