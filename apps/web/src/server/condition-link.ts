import 'server-only'
import { issueRenterLink } from '@hold/db'
import type { RentalDetail, Transaction } from '@hold/db'
import { getTranslations } from 'next-intl/server'
import { readLocale } from '@/features/auth/locale-input'
import { qrSvg } from './qr'
import { newRenterLink, renterUrl } from './renter-links'
import { getServices } from './services'

// What a link to the condition report may do: see the rental, confirm or add to what staff photographed, and report
// something that happens while the renter has it (extensions.md section 10).
export const CONDITION_LINK_SCOPES = ['view', 'confirm_condition', 'report_incident']

// Once the rental is handed over, the renter is sent the condition report, and staff can show it as a code at the
// counter (architecture.md section 11.2).
export async function conditionLink(transaction: Transaction, shopId: string, shopName: string, rental: Pick<RentalDetail, 'id' | 'endsAt' | 'language' | 'contactEmail'>): Promise<{ readonly url: string; readonly qr: string; readonly emailed: boolean }> {
  const link = await newRenterLink(rental.endsAt)
  await issueRenterLink(transaction, shopId, rental.id, link, CONDITION_LINK_SCOPES)
  const language = readLocale(rental.language)
  const url = `${await renterUrl(link.token, language)}/condition`
  let emailed = false
  if (rental.contactEmail !== null) {
    const t = await getTranslations({ locale: language, namespace: 'emails.conditionReport' })
    emailed = await (await getServices()).mailer.send({ to: rental.contactEmail, subject: t('subject', { shop: shopName }), text: t('body', { shop: shopName, link: url }) })
  }
  return { url, qr: await qrSvg(url), emailed }
}
