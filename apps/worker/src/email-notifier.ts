import { inShop, rentalDetail, renterContact, shopOwners, shopSettings } from '@hold/db'
import type { Database } from '@hold/db'
import { money } from '@hold/domain'
import { holdExpiredEmail, holdReplacementEmail, promiseMissedEmail, promiseMissedRenterEmail } from '@hold/notify'
import type { Email, Mailer } from '@hold/notify'
import type { Notifier } from '@hold/settle'

// Tells people what the worker found, by email through Hold's SMTP account, each in their own language.
export function createEmailNotifier(options: { readonly database: Database; readonly mailer: Mailer; readonly publicUrl: string }): Notifier {
  // The web app's rental page for staff (apps/web/src/lib/routes.ts), in the reader's language.
  const rentalUrl = (language: string, rentalId: string) => `${options.publicUrl}${language === 'en' ? '' : `/${language}`}/shop/rentals/${rentalId}`
  const send = async (email: Email) => {
    if (!(await options.mailer.send(email))) throw new Error('An email could not be sent.')
  }
  return {
    async tell(notice) {
      const { owners, shop, rental, renter } = await inShop(options.database, { role: 'hold_worker', shopId: notice.shopId }, async (transaction) => ({
        owners: await shopOwners(transaction),
        shop: await shopSettings(transaction, notice.shopId),
        rental: await rentalDetail(transaction, notice.rentalId, new Date()),
        renter: await renterContact(transaction, notice.rentalId),
      }))
      if (shop === undefined || rental === undefined) return
      const amount = money(rental.holdCents, rental.currency)
      if (notice.kind === 'hold_replacement') {
        // Nobody to ask is the same as asking and hearing nothing: the hold expires, and the owners are told then.
        if (renter === undefined) return
        const endsOn = new Intl.DateTimeFormat(renter.language, { day: 'numeric', month: 'short', timeZone: shop.timeZone }).format(notice.holdEndsAt)
        await send(holdReplacementEmail(renter.email, renter.language, { shopName: shop.name, amount, approveUrl: notice.approveUrl, endsOn }))
        return
      }
      if (notice.kind === 'promise_missed') {
        for (const owner of owners) await send(promiseMissedEmail(owner.email, owner.language, { shopName: shop.name, renter: rental.who ?? '—', claimUrl: `${rentalUrl(owner.language, rental.id)}/claim`, waived: notice.waived }))
        if (renter !== undefined) await send(promiseMissedRenterEmail(renter.email, renter.language, { shopName: shop.name, waived: notice.waived }))
        return
      }
      for (const owner of owners) {
        await send(holdExpiredEmail(owner.email, owner.language, { shopName: shop.name, renter: rental.who ?? '—', amount, rentalUrl: rentalUrl(owner.language, rental.id) }))
      }
    },
  }
}
