import 'server-only'
import { chooseEmail, recordText, renterContact, takeTextAllowance } from '@hold/db'
import type { RenterContact, Transaction } from '@hold/db'
import type { RenterCodeRecipient } from '@hold/domain'
import { reachRenter } from '@hold/notify'
import type { Reached, RenterMessage } from '@hold/notify'
import { pushToRenterIn } from './push'
import { getServices } from './services'

// Reaches a rental's renter the way they chose (architecture.md section 12.3), inside the caller's transaction, so each
// text is recorded with the work that sent it and never waits on a row that work holds. `to` is where a one-time code
// was addressed, when that is not the renter's choice: the PayPal email they asked for it on, or the phone they are
// confirming. Undefined when the rental has nobody to reach. Its notices are pushed to the renter's phone app too.
export async function reachRenterIn(transaction: Transaction, rentalId: string, compose: (contact: RenterContact) => RenterMessage, to?: RenterCodeRecipient): Promise<Reached | undefined> {
  const contact = await renterContact(transaction, rentalId)
  if (contact === undefined) return undefined
  const { mailer, texter } = await getServices()
  const addressed = to === undefined ? { channel: contact.channel, phone: contact.phone } : to.channel === 'text' ? { channel: 'text' as const, phone: to.phone } : { channel: 'email' as const, phone: null }
  return reachRenter(
    {
      mailer,
      texter,
      recordText: (record) => recordText(transaction, record, new Date()),
      allowText: (target) => takeTextAllowance(transaction, target),
      stopTexts: (stopped) => chooseEmail(transaction, stopped),
      push: (event) => pushToRenterIn(transaction, rentalId, event),
    },
    { shopId: contact.shopId, rentalId, ...addressed, simulated: contact.simulated },
    compose(contact),
  )
}

// The last line of a text that carries a code: the phone offers the code on Hold's own site, and on no other.
export async function codeLine(code: string): Promise<string> {
  return `@${new URL((await getServices()).config.publicUrl).hostname} #${code}`
}
