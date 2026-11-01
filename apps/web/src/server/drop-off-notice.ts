import 'server-only'
import { dropOffNotice, issueRenterLink } from '@hold/db'
import type { Transaction } from '@hold/db'
import { getTranslations } from 'next-intl/server'
import { readLocale } from '@/features/auth/locale-input'
import { newRenterLink, renterUrl } from './renter-links'
import { reachRenterIn } from './renter-reach'

// Tells the renter, in their language and the way they are reached, that the shop looked at the drop point and the
// item was not there (section 6.13), with a link that may only look at their return. A sample rental has no renter to
// tell. Says how it went, or null when it reached nobody.
export async function tellRenterNotFound(transaction: Transaction, shop: { readonly id: string; readonly name: string }, rentalId: string, lookedAt: Date): Promise<'text' | 'email' | null> {
  const notice = await dropOffNotice(transaction, rentalId)
  if (notice === undefined || notice.droppedOffAt === null || notice.simulated) return null
  const link = await newRenterLink(notice.endsAt)
  await issueRenterLink(transaction, shop.id, rentalId, link, ['view'])
  const language = readLocale(notice.language)
  const url = `${await renterUrl(link.token, language)}/return`
  const when = new Intl.DateTimeFormat(language, { weekday: 'long', hour: '2-digit', minute: '2-digit', timeZone: notice.timeZone })
  const emails = await getTranslations({ locale: language, namespace: 'emails.dropOffMissing' })
  const texts = await getTranslations({ locale: language, namespace: 'texts' })
  const body = emails('body', { shop: shop.name, sent: when.format(notice.droppedOffAt), looked: when.format(lookedAt) })
  const reached = await reachRenterIn(transaction, rentalId, () => ({
    purpose: 'drop_off',
    email: notice.email == null ? null : { to: notice.email, subject: emails('subject', { shop: shop.name }), text: `${body}\n\n${url}` },
    text: texts('dropOffMissing', { shop: shop.name, looked: when.format(lookedAt), link: url }),
  }))
  return reached === undefined || reached.via === 'none' ? null : reached.via
}
