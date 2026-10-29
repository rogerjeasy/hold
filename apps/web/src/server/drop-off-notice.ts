import 'server-only'
import { dropOffNotice, issueRenterLink } from '@hold/db'
import type { Transaction } from '@hold/db'
import { getTranslations } from 'next-intl/server'
import { readLocale } from '@/features/auth/locale-input'
import { newRenterLink, renterUrl } from './renter-links'
import { getServices } from './services'

// Tells the renter, in their language, that the shop looked at the drop point and the item was not there (section
// 6.13), with a link that may only look at their return. A sample rental has no renter to tell. True once sent.
export async function tellRenterNotFound(transaction: Transaction, shop: { readonly id: string; readonly name: string }, rentalId: string, lookedAt: Date): Promise<boolean> {
  const notice = await dropOffNotice(transaction, rentalId)
  if (notice?.email == null || notice.droppedOffAt === null || notice.simulated) return false
  const link = await newRenterLink(notice.endsAt)
  await issueRenterLink(transaction, shop.id, rentalId, link, ['view'])
  const language = readLocale(notice.language)
  const url = `${await renterUrl(link.token, language)}/return`
  const when = new Intl.DateTimeFormat(language, { weekday: 'long', hour: '2-digit', minute: '2-digit', timeZone: notice.timeZone })
  const t = await getTranslations({ locale: language, namespace: 'emails.dropOffMissing' })
  const body = t('body', { shop: shop.name, sent: when.format(notice.droppedOffAt), looked: when.format(lookedAt) })
  return (await getServices()).mailer.send({ to: notice.email, subject: t('subject', { shop: shop.name }), text: `${body}\n\n${url}` })
}
