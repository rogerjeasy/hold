import 'server-only'
import { decisionCopyRecipient, markPhoneNoticeSent, phoneNoticeDue, shopSettings } from '@hold/db'
import { maskedPhone } from '@hold/domain'
import { getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import type { InLinkShop } from './renter-access'
import { getServices } from './services'

export type CopiedDecision = 'claim_accepted' | 'claim_contested' | 'settlement_confirmed' | 'settlement_declined' | 'incident_agreed'

// Mail to the email PayPal gave for the payer, while the renter's codes go to a confirmed phone: so the payer hears of
// what the phone did. What it tells already stands, so a message that cannot be sent changes nothing and is not retried.
async function emailPayer(inLinkShop: InLinkShop, link: { readonly shopId: string; readonly rentalId: string }, compose: (shop: string) => { readonly subject: string; readonly text: string }): Promise<void> {
  await inLinkShop(async (transaction) => {
    const to = await decisionCopyRecipient(transaction, link.rentalId)
    if (to === undefined) return
    await (await getServices()).mailer.send({ to: to.email, ...compose((await shopSettings(transaction, link.shopId))?.name ?? '') })
  })
}

// A number newly confirmed for texts (architecture.md section 12.3): until the hold is placed anyone holding the link
// may set one, so the payer is told which number it is. Sent when the number is confirmed, or, if PayPal had not yet
// named the payer then, before the first code goes to that phone. Marked sent only once the mail was taken.
export async function tellPayerOfPhone(inLinkShop: InLinkShop, link: { readonly shopId: string; readonly rentalId: string }, locale: Locale): Promise<void> {
  const t = await getTranslations({ locale, namespace: 'emails.phoneConfirmed' })
  await inLinkShop(async (transaction) => {
    const due = await phoneNoticeDue(transaction, link.rentalId)
    if (due === undefined) return
    const shop = (await shopSettings(transaction, link.shopId))?.name ?? ''
    const phone = maskedPhone(due.phone)
    if (await (await getServices()).mailer.send({ to: due.email, subject: t('subject', { shop }), text: t('body', { shop, phone }) })) await markPhoneNoticeSent(transaction, link.rentalId, new Date())
  })
}

// A money decision made with a code a phone received, so a misused phone never goes unnoticed.
export async function copyDecisionToEmail(inLinkShop: InLinkShop, link: { readonly shopId: string; readonly rentalId: string }, decision: CopiedDecision, locale: Locale): Promise<void> {
  const t = await getTranslations({ locale, namespace: 'emails.decisionCopy' })
  await emailPayer(inLinkShop, link, (shop) => ({ subject: t('subject', { shop }), text: t(`body.${decision}`, { shop }) }))
}
