import 'server-only'
import { BOOKING_LINK_SCOPES, inShop, issueRenterLink, rentalDetail, shopSettings } from '@hold/db'
import type { Database } from '@hold/db'
import { holdOrderDescription } from '@hold/notify'
import type { RenterAsk } from '@hold/settle'
import { newRenterLink, renterUrl } from './renter-links'

// Asking a renter for a new hold in the test environment, where the web app stands in for the worker: a new link to
// the rental's hold page, signed as the app signs every link, and the words PayPal shows.
export function createRenterAsk(database: Database): RenterAsk {
  return {
    async approval(shopId, rentalId) {
      const link = await inShop(database, { role: 'hold_app', shopId }, async (transaction) => {
        const rental = await rentalDetail(transaction, rentalId, new Date())
        const shop = await shopSettings(transaction, shopId)
        if (rental === undefined || shop === undefined) throw new Error('The rental is not in this shop.')
        const issued = await newRenterLink(rental.endsAt)
        await issueRenterLink(transaction, shopId, rentalId, issued, BOOKING_LINK_SCOPES)
        return { token: issued.token, language: rental.language, shopName: shop.name }
      })
      return { url: `${await renterUrl(link.token, link.language)}/pay`, orderDescription: holdOrderDescription(link.language, link.shopName) }
    },
  }
}
