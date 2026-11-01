import { inShop, itemCatalog, registerOwner } from '@hold/db'
import * as items from '@/features/items/actions'
import * as rentals from '@/features/rentals/actions'
import * as renter from '@/features/renter/actions'
import * as shop from '@/features/shop/actions'
import { getServices } from '@/server/services'
import { form, signIn } from './shop-session'

// For tests of what follows the hold: a shop with e-bikes, PayPal connected and prices published, and rentals made
// ready for handover through the same server functions staff and renters use. Each test file mocks next/headers onto
// its cookie jar, as for shop-session.

const day = (offset: number) => `${new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)}T10:00`
const tokenOf = (url: string) => url.split('/r/')[1]?.split(/[/?]/)[0] ?? ''
const orderOf = (approvalUrl: string) => approvalUrl.split('/').at(-1) ?? ''

export type HandoverShop = {
  readonly shopId: string
  readonly owner: string
  // `beforeHold` runs once the fee is paid, before staff ask for the hold: where a renter at the counter chooses texts.
  readyRental(count?: number, beforeHold?: (token: string) => Promise<void>): Promise<{ readonly rentalId: string; readonly token: string }>
}

// `demoSession`: a shop as a judge's demo opens it, which shows its texts on the renter's page instead of sending them.
export async function handoverShop(jar: Map<string, string>, owner: string, shopName: string, options: { readonly demoSession?: boolean } = {}): Promise<HandoverShop> {
  const { database, simulatedPayPal } = await getServices()
  const subject = await signIn(jar, owner, 'passkey')
  const registered = await registerOwner(database, { subject, email: owner, name: 'Ana', language: 'en', shop: { name: shopName, timeZone: 'UTC', demoSession: options.demoSession ?? false } })
  await shop.publishPrices(null, form({ currency: 'EUR', threshold: '', wearPolicy: 'Scuffs are wear.', description: 'Scratch', category: 'damage', amount: '35', locale: 'en' }))
  await shop.connectPayPal(null, form({ clientId: 'sandbox-client-id', clientSecret: 'sandbox-client-secret', locale: 'en' }))
  await items.saveItemType(
    null,
    form({ itemTypeId: '', name: 'City e-bike', category: 'e_bike', value: '2400', hold: '300', dayRate: '40', viewLabel: ['Left side', 'Right side'], viewOutline: ['whole_side', 'whole_side'], viewRequired: ['yes', 'yes'], locale: 'en' }),
  )
  const typeId = (await inShop(database, { role: 'hold_app', shopId: registered.shopId, userId: registered.userId }, itemCatalog)).types[0]?.id ?? ''
  await items.addItems(null, form({ itemTypeId: typeId, count: '4', size: '', serial: '', locale: 'en' }))
  let from = 0
  return {
    shopId: registered.shopId,
    owner,
    async readyRental(count = 1, beforeHold) {
      from += 3
      await signIn(jar, owner, 'email_code')
      const booked = await rentals.bookRental(null, form({ startsAt: day(from), endsAt: day(from + 2), itemTypeId: typeId, count: String(count), contactName: 'Priya', contactEmail: 'priya@renter.example', language: 'en', locale: 'en' }))
      if (!booked.ok) throw new Error(JSON.stringify(booked))
      const { rentalId } = booked.value
      const shown = await rentals.showRenterLink(null, form({ rentalId, locale: 'en' }))
      if (!shown.ok) throw new Error(JSON.stringify(shown))
      const token = tokenOf(shown.value.url)
      const fee = await renter.payFee(null, form({ token, locale: 'en' }))
      if (!fee.ok) throw new Error(JSON.stringify(fee))
      simulatedPayPal?.approveOrder(orderOf(fee.value.approvalUrl))
      await renter.confirmFee(null, form({ token, orderId: orderOf(fee.value.approvalUrl), locale: 'en' }))
      await beforeHold?.(token)
      await signIn(jar, owner, 'email_code')
      const asked = await rentals.askForHold(null, form({ rentalId, locale: 'en' }))
      if (!asked.ok) throw new Error(JSON.stringify(asked))
      const hold = await renter.approveHold(null, form({ token, locale: 'en' }))
      if (!hold.ok) throw new Error(JSON.stringify(hold))
      simulatedPayPal?.approveOrder(orderOf(hold.value.approvalUrl))
      await renter.confirmHold(null, form({ token, orderId: orderOf(hold.value.approvalUrl), locale: 'en' }))
      return { rentalId, token }
    },
  }
}
