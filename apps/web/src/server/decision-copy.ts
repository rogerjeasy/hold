import 'server-only'
import { decisionCopyRecipient, shopSettings } from '@hold/db'
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
// may set one, so the payer is told it was set.
export async function tellPayerOfPhone(inLinkShop: InLinkShop, link: { readonly shopId: string; readonly rentalId: string }, phone: string, locale: Locale): Promise<void> {
  const t = await getTranslations({ locale, namespace: 'emails.phoneConfirmed' })
  await emailPayer(inLinkShop, link, (shop) => ({ subject: t('subject', { shop }), text: t('body', { shop, phone }) }))
}

// A money decision made with a code a phone received, so a misused phone never goes unnoticed.
export async function copyDecisionToEmail(inLinkShop: InLinkShop, link: { readonly shopId: string; readonly rentalId: string }, decision: CopiedDecision, locale: Locale): Promise<void> {
  const t = await getTranslations({ locale, namespace: 'emails.decisionCopy' })
  await emailPayer(inLinkShop, link, (shop) => ({ subject: t('subject', { shop }), text: t(`body.${decision}`, { shop }) }))
}
