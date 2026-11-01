import 'server-only'
import { issueRenterLink } from '@hold/db'
import type { RentalDetail, Transaction } from '@hold/db'
import { getTranslations } from 'next-intl/server'
import { readLocale } from '@/features/auth/locale-input'
import { qrSvg } from './qr'
import { newRenterLink, renterUrl } from './renter-links'
import { reachRenterIn } from './renter-reach'

// What a link to the condition report may do: see the rental, confirm or add to what staff photographed, and report
// something that happens while the renter has it (extensions.md section 10).
export const CONDITION_LINK_SCOPES = ['view', 'confirm_condition', 'extend', 'report_incident', 'return_item']

// Once the rental is handed over, the renter is sent the condition report, by text or by email as they are reached
// (architecture.md sections 11.2 and 12.3), and staff can show it as a code at the counter. The email goes to the
// address given at booking, as every link does. `sent` is null when it reached nobody.
export async function conditionLink(transaction: Transaction, shopId: string, shopName: string, rental: Pick<RentalDetail, 'id' | 'endsAt' | 'language' | 'contactEmail'>): Promise<{ readonly url: string; readonly qr: string; readonly sent: 'text' | 'email' | null }> {
  const link = await newRenterLink(rental.endsAt)
  await issueRenterLink(transaction, shopId, rental.id, link, CONDITION_LINK_SCOPES)
  const language = readLocale(rental.language)
  const url = `${await renterUrl(link.token, language)}/condition`
  const emails = await getTranslations({ locale: language, namespace: 'emails.conditionReport' })
  const texts = await getTranslations({ locale: language, namespace: 'texts' })
  const reached = await reachRenterIn(transaction, rental.id, () => ({
    purpose: 'condition_link',
    email: rental.contactEmail === null ? null : { to: rental.contactEmail, subject: emails('subject', { shop: shopName }), text: emails('body', { shop: shopName, link: url }) },
    text: texts('conditionReport', { shop: shopName, link: url }),
  }))
  return { url, qr: await qrSvg(url), sent: reached === undefined || reached.via === 'none' ? null : reached.via }
}
