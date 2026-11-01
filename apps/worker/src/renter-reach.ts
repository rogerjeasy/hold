import { chooseEmail, inShop, recordText, renterContact, takeTextAllowance } from '@hold/db'
import type { Database, RenterContact, Transaction } from '@hold/db'
import { reachRenter } from '@hold/notify'
import type { Mailer, PushSender, Reached, RenterMessage, Texter } from '@hold/notify'
import { createRenterPush } from './push.ts'

// Reaches a rental's renter from the worker the way they chose (architecture.md section 12.3): the message is composed
// from their contact, in their language, and pushed to their phone app when a push sender is given. Undefined when the
// rental has nobody to reach.
export type RenterReach = (shopId: string, rentalId: string, compose: (contact: RenterContact) => RenterMessage) => Promise<Reached | undefined>

export function createRenterReach(options: { readonly database: Database; readonly mailer: Mailer; readonly texter: Texter; readonly push?: PushSender }): RenterReach {
  const pushToRenter = options.push === undefined ? undefined : createRenterPush({ database: options.database, push: options.push })
  return async (shopId, rentalId, compose) => {
    const asWorker = <Result>(work: (transaction: Transaction) => Promise<Result>) => inShop(options.database, { role: 'hold_worker', shopId }, work)
    const contact = await asWorker((transaction) => renterContact(transaction, rentalId))
    if (contact === undefined) return undefined
    return reachRenter(
      {
        mailer: options.mailer,
        texter: options.texter,
        recordText: (record) => asWorker((transaction) => recordText(transaction, record, new Date())),
        allowText: (target) => asWorker((transaction) => takeTextAllowance(transaction, target)),
        stopTexts: (stopped) => asWorker((transaction) => chooseEmail(transaction, stopped)),
        ...(pushToRenter === undefined ? {} : { push: (event) => pushToRenter(shopId, rentalId, event) }),
      },
      { shopId, rentalId, channel: contact.channel, phone: contact.phone, simulated: contact.simulated },
      compose(contact),
    )
  }
}
