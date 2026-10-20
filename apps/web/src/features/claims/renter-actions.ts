'use server'
import { createHmac, randomInt } from 'node:crypto'
import { acknowledgeClaimReview, issueClaimCode, replyToClaim, useClaimCode } from '@hold/db'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { readLocale } from '@/features/auth/locale-input'
import { Refusal } from '@/server/action'
import { renterAction, withToken } from '@/server/renter-access'
import { getServices, TEST_SIGN_IN_CODE } from '@/server/services'
import { sendSettlement } from '@/server/settlement-queue'

const digest = (key: Buffer, linkId: string, code: string) => createHmac('sha256', key).update(`claim-reply:${linkId}:${code}`).digest('hex')
export const sendClaimCode = renterAction({ name: 'renter.claim_code_requested', scope: 'accept', input: withToken({}) }, async (link, input, inLinkShop) => {
  const services = await getServices()
  const code = services.config.services === 'fake' ? TEST_SIGN_IN_CODE : String(randomInt(0, 100000000)).padStart(8, '0')
  const issued = await inLinkShop((transaction) => issueClaimCode(transaction, link.id, digest(services.renterLinkKey, link.id, code), new Date()))
  if (!issued.ok) return new Refusal(issued.reason)
  const t = await getTranslations({ locale: readLocale(input.locale), namespace: 'emails.claimCode' })
  if (!await services.mailer.send({ to: issued.email, subject: t('subject'), text: t('body', { code }) })) return new Refusal('email_unavailable')
  return {}
})

function reply(decision: 'accept' | 'contest') {
  return renterAction({ name: `renter.claim_${decision}`, scope: decision, input: withToken({ code: z.string().regex(/^[0-9]{8}$/), comment: z.string().trim().max(1000).optional() }) }, async (link, input, inLinkShop) => {
    const services = await getServices()
    const result = await inLinkShop(async (transaction) => {
      const verified = await useClaimCode(transaction, link.id, digest(services.renterLinkKey, link.id, input.code), new Date())
      if (!verified.ok) return verified
      return replyToClaim(transaction, link.rentalId, decision, input.comment ?? '', new Date())
    })
    if (!result.ok) return new Refusal(result.reason)
    if (result.executionId !== null) {
      try { await sendSettlement(link.shopId, link.rentalId, result.executionId) } catch { /* The committed outbox retries delivery. */ }
    }
    return {}
  })
}
export const acceptClaim = reply('accept')
export const contestClaim = reply('contest')

export const acknowledgeClaim = renterAction({ name: 'renter.claim_reviewed', scope: 'accept', input: withToken({}) }, async (link, _input, inLinkShop) => {
  const result = await inLinkShop((transaction) => acknowledgeClaimReview(transaction, link.rentalId, new Date()))
  return result.ok ? {} : new Refusal(result.reason)
})
