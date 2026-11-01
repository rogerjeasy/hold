import 'server-only'
import { decisionCopyRecipient, shopSettings } from '@hold/db'
import { getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import type { InLinkShop } from './renter-access'
import { getServices } from './services'

export type CopiedDecision = 'claim_accepted' | 'claim_contested' | 'settlement_confirmed' | 'settlement_declined' | 'incident_agreed'

// A money decision made with a code a phone received is copied to the email PayPal gave for the payer (architecture.md
// section 12.3), so a misused phone never goes unnoticed. The decision already stands, so a copy that cannot be sent
// changes nothing; it is not retried.
export async function copyDecisionToEmail(inLinkShop: InLinkShop, link: { readonly shopId: string; readonly rentalId: string }, decision: CopiedDecision, locale: Locale): Promise<void> {
  const t = await getTranslations({ locale, namespace: 'emails.decisionCopy' })
  await inLinkShop(async (transaction) => {
    const to = await decisionCopyRecipient(transaction, link.rentalId)
    if (to === undefined) return
    const shop = (await shopSettings(transaction, link.shopId))?.name ?? ''
    await (await getServices()).mailer.send({ to: to.email, subject: t('subject', { shop }), text: t(`body.${decision}`, { shop }) })
  })
}
