import { randomBytes } from 'node:crypto'
import { issueRenterToken, renterLinkExpiry, renterLinkKey, renterLinkPath } from '@hold/auth'
import { BOOKING_LINK_SCOPES, inShop, issueRenterLink, rentalDetail, shopSettings } from '@hold/db'
import type { Database } from '@hold/db'
import { holdOrderDescription } from '@hold/notify'
import type { RenterAsk } from '@hold/settle'

// Asking a renter for a new hold before the old one ends (architecture.md section 7.4): a new link to the rental's
// hold page, signed with the renter-link key the web app reads too, and the words PayPal shows, in the rental's
// language. The worker never holds the web app's cookie key.
export function createWorkerRenterAsk(options: { readonly database: Database; readonly publicUrl: string; readonly linkKey: () => Promise<Buffer> }): RenterAsk {
  return {
    async approval(shopId, rentalId) {
      const key = renterLinkKey(await options.linkKey())
      const link = await inShop(options.database, { role: 'hold_worker', shopId }, async (transaction) => {
        const rental = await rentalDetail(transaction, rentalId, new Date())
        const shop = await shopSettings(transaction, shopId)
        if (rental === undefined || shop === undefined) throw new Error('The rental is not in this shop.')
        const issued = issueRenterToken(key, () => randomBytes(32))
        await issueRenterLink(transaction, shopId, rentalId, { fingerprint: issued.fingerprint, expiresAt: renterLinkExpiry(rental.endsAt) }, BOOKING_LINK_SCOPES)
        return { token: issued.token, language: rental.language, shopName: shop.name }
      })
      return { url: `${options.publicUrl}${renterLinkPath(link.token, link.language)}/pay`, orderDescription: holdOrderDescription(link.language, link.shopName) }
    },
  }
}
