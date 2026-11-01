import { inShop, rentalDetail, shopOwners, shopSettings } from '@hold/db'
import type { Database } from '@hold/db'
import { money } from '@hold/domain'
import { holdExpiredEmail, holdReplacementEmail, holdReplacementText, promiseMissedEmail, promiseMissedRenterEmail, promiseMissedRenterText } from '@hold/notify'
import type { Email, Mailer, Reached, Texter } from '@hold/notify'
import { createRenterReach } from './renter-reach.ts'
import type { Notifier } from '@hold/settle'

// Tells people what the worker found, each in their own language: staff by email through Hold's SMTP account, and the
// renter the way they chose, by text or by email (architecture.md section 12.3).
export function createNotifier(options: { readonly database: Database; readonly mailer: Mailer; readonly texter: Texter; readonly publicUrl: string }): Notifier {
  const reach = createRenterReach(options)
  // The web app's rental page for staff (apps/web/src/lib/routes.ts), in the reader's language.
  const rentalUrl = (language: string, rentalId: string) => `${options.publicUrl}${language === 'en' ? '' : `/${language}`}/shop/rentals/${rentalId}`
  const send = async (email: Email) => {
    if (!(await options.mailer.send(email))) throw new Error('An email could not be sent.')
  }
  // Nobody to reach is not a failure; a message that reached nobody is, so the queue tries again.
  const reached = (result: Reached | undefined) => {
    if (result?.via === 'none') throw new Error('A message to the renter could not be sent.')
  }
  return {
    async tell(notice) {
      const { owners, shop, rental } = await inShop(options.database, { role: 'hold_worker', shopId: notice.shopId }, async (transaction) => ({
        owners: await shopOwners(transaction),
        shop: await shopSettings(transaction, notice.shopId),
        rental: await rentalDetail(transaction, notice.rentalId, new Date()),
      }))
      if (shop === undefined || rental === undefined) return
      const amount = money(rental.holdCents, rental.currency)
      if (notice.kind === 'hold_replacement') {
        // Nobody to ask is the same as asking and hearing nothing: the hold expires, and the owners are told then.
        reached(await reach(notice.shopId, notice.rentalId, (renter) => {
          const facts = { shopName: shop.name, amount, approveUrl: notice.approveUrl, endsOn: new Intl.DateTimeFormat(renter.language, { day: 'numeric', month: 'short', timeZone: shop.timeZone }).format(notice.holdEndsAt) }
          return { purpose: 'hold_renewal', email: renter.email === null ? null : holdReplacementEmail(renter.email, renter.language, facts), text: holdReplacementText(renter.language, facts) }
        }))
        return
      }
      if (notice.kind === 'promise_missed') {
        for (const owner of owners) await send(promiseMissedEmail(owner.email, owner.language, { shopName: shop.name, renter: rental.who ?? '—', claimUrl: `${rentalUrl(owner.language, rental.id)}/claim`, waived: notice.waived }))
        const facts = { shopName: shop.name, waived: notice.waived }
        reached(await reach(notice.shopId, notice.rentalId, (renter) => ({ purpose: 'promise_missed', email: renter.email === null ? null : promiseMissedRenterEmail(renter.email, renter.language, facts), text: promiseMissedRenterText(renter.language, facts) })))
        return
      }
      for (const owner of owners) {
        await send(holdExpiredEmail(owner.email, owner.language, { shopName: shop.name, renter: rental.who ?? '—', amount, rentalUrl: rentalUrl(owner.language, rental.id) }))
      }
    },
  }
}
