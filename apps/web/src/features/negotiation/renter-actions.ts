'use server'
import { auditLog, confirmAgreement, issueSettlementCode, openAdvocate, renterNegotiation, renterView, stopRenterAdvocate, useClaimCode } from '@hold/db'
import { parseAmount } from '@hold/domain'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { readLocale } from '@/features/auth/locale-input'
import { Refusal } from '@/server/action'
import { writeContestSummary } from '@/server/contest-summary'
import { sendNegotiation } from '@/server/negotiation-queue'
import { renterAction, withToken } from '@/server/renter-access'
import { CODE_PURPOSES, newRenterCode, renterCodeDigest } from '@/server/renter-code'
import { getServices } from '@/server/services'
import { sendSettlement } from '@/server/settlement-queue'
import { advocateInput } from './negotiation-input'

// The renter's side of an advocate (extensions.md section 9.4). Handing the contest to an advocate is a money decision,
// so it takes the same one-time code as accepting or contesting; confirming what the advocates agreed takes a fresh one.
// The advocate is Hold's, or the renter's own assistant connected to this rental: then the code grants that assistant
// alone the negotiation scope on this claim, and the shop's turn comes back to the worker after each of its moves.

export const startAdvocate = renterAction({ name: 'renter.advocate_started', scope: 'contest', input: withToken(advocateInput) }, async (link, input, inLinkShop) => {
  const { config } = await getServices()
  const hash = await renterCodeDigest(CODE_PURPOSES.claimReply, link.id, input.code)
  const result = await inLinkShop(async (transaction) => {
    const verified = await useClaimCode(transaction, link.id, hash, new Date())
    if (!verified.ok) return verified
    const rental = await renterView(transaction, link.rentalId, new Date())
    const highest = rental === undefined ? undefined : parseAmount(input.highest, rental.currency)
    if (highest === undefined) return { ok: false, reason: 'amount_invalid' } as const
    return openAdvocate(transaction, { rentalId: link.rentalId, highestTotalCents: highest.cents, comment: input.comment ?? '', simulated: config.services === 'fake', advocate: input.advocate ?? 'hold' }, new Date())
  })
  if (!result.ok) return new Refusal(result.reason)
  try { await sendNegotiation(link.shopId, link.rentalId, result.negotiationId, result.outboxId) } catch { /* The committed outbox retries delivery. */ }
  // The owner decides if the advocates do not agree: the summary is there for them, and the renter, either way.
  await writeContestSummary(link.shopId, link.rentalId)
  return { kind: result.kind }
})

export const sendSettlementCode = renterAction({ name: 'renter.settlement_code_requested', scope: 'accept', input: withToken({}) }, async (link, input, inLinkShop) => {
  const services = await getServices()
  const code = await newRenterCode()
  const hash = await renterCodeDigest(CODE_PURPOSES.settlement, link.id, code)
  const issued = await inLinkShop((transaction) => issueSettlementCode(transaction, link.id, hash, new Date()))
  if (!issued.ok) return new Refusal(issued.reason)
  const t = await getTranslations({ locale: readLocale(input.locale), namespace: 'emails.claimCode' })
  if (!await services.mailer.send({ to: issued.email, subject: t('subject'), text: t('body', { code }) })) return new Refusal('email_unavailable')
  if (issued.sandboxContact) await inLinkShop((transaction) => transaction.insert(auditLog).values({ shopId: link.shopId, actorKind: 'renter', actorId: link.id, action: 'renter.settlement_code_sandbox_contact', subjectKind: 'rental', subjectId: link.rentalId, detail: { sandbox: true } }))
  return { sandboxContact: issued.sandboxContact }
})

export const confirmSettlement = renterAction({ name: 'renter.settlement_decided', scope: 'accept', input: withToken({ code: z.string().regex(/^[0-9]{8}$/), decision: z.enum(['confirm', 'decline']) }) }, async (link, input, inLinkShop) => {
  const hash = await renterCodeDigest(CODE_PURPOSES.settlement, link.id, input.code)
  const result = await inLinkShop(async (transaction) => {
    const verified = await useClaimCode(transaction, link.id, hash, new Date())
    if (!verified.ok) return verified
    const negotiation = await renterNegotiation(transaction, link.rentalId)
    if (negotiation === undefined) return { ok: false, reason: 'not_agreed' } as const
    return confirmAgreement(transaction, negotiation.transcript.id, { kind: 'renter' }, input.decision, new Date())
  })
  if (!result.ok) return new Refusal(result.reason)
  if (result.executionId !== null) {
    try { await sendSettlement(link.shopId, result.rentalId, result.executionId) } catch { /* The committed outbox retries delivery. */ }
  }
  return {}
})

// Stopping the advocate needs no code: it moves no money, and the owner then decides (section 3, rule 7).
export const stopAdvocate = renterAction({ name: 'renter.advocate_stopped', scope: 'contest', input: withToken({}) }, async (link, _input, inLinkShop) => {
  const result = await inLinkShop((transaction) => stopRenterAdvocate(transaction, link.rentalId, new Date()))
  return result.ok ? {} : new Refusal(result.reason)
})
