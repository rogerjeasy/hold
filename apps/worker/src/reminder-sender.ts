import { inShop, renterContact, shopSettings } from '@hold/db'
import type { Database } from '@hold/db'
import { reminderEmail } from '@hold/notify'
import type { Mailer } from '@hold/notify'
import type { Reminder } from '@hold/ops'

// Sends one of the operations agent's automatic reminders to the renter, in their language, with the due time in the
// shop's own time zone. The run has already recorded it, so it is never sent twice in a day.
export function createReminderSender(options: { readonly database: Database; readonly mailer: Mailer }): (reminder: Reminder) => Promise<void> {
  return async (reminder) => {
    const { shop, renter } = await inShop(options.database, { role: 'hold_worker', shopId: reminder.shopId }, async (transaction) => ({
      shop: await shopSettings(transaction, reminder.shopId),
      renter: await renterContact(transaction, reminder.rentalId),
    }))
    if (shop === undefined || renter === undefined) return
    const dueOn = reminder.dueAt === null ? null : new Intl.DateTimeFormat(renter.language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: shop.timeZone }).format(reminder.dueAt)
    if (!(await options.mailer.send(reminderEmail(renter.email, renter.language, reminder.kind, { shopName: shop.name, dueOn })))) throw new Error('A reminder could not be sent.')
  }
}
