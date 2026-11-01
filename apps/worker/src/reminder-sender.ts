import { inShop, shopSettings } from '@hold/db'
import type { Database } from '@hold/db'
import { reminderEmail, reminderText } from '@hold/notify'
import type { Mailer, PushSender, Texter } from '@hold/notify'
import { createRenterReach } from './renter-reach.ts'
import type { Reminder } from '@hold/ops'

// Sends one of the operations agent's automatic reminders to the renter, the way they chose and in their language, with
// the due time in the shop's own time zone. The run has already recorded it, so it is never sent twice in a day.
export function createReminderSender(options: { readonly database: Database; readonly mailer: Mailer; readonly texter: Texter; readonly push?: PushSender }): (reminder: Reminder) => Promise<void> {
  const reach = createRenterReach(options)
  return async (reminder) => {
    const shop = await inShop(options.database, { role: 'hold_worker', shopId: reminder.shopId }, (transaction) => shopSettings(transaction, reminder.shopId))
    if (shop === undefined) return
    const reached = await reach(reminder.shopId, reminder.rentalId, (renter) => {
      const dueOn = reminder.dueAt === null ? null : new Intl.DateTimeFormat(renter.language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: shop.timeZone }).format(reminder.dueAt)
      const facts = { shopName: shop.name, dueOn }
      return { purpose: 'reminder', email: renter.email === null ? null : reminderEmail(renter.email, renter.language, reminder.kind, facts), text: reminderText(renter.language, reminder.kind, facts) }
    })
    if (reached?.via === 'none') throw new Error('A reminder could not be sent.')
  }
}
