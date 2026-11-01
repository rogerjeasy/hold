import 'server-only'
import { renterContact, shownTexts } from '@hold/db'
import type { Transaction } from '@hold/db'
import { contactChangeNeedsCode, maskedPhone } from '@hold/domain'
import type { RentalState } from '@hold/domain'
import type { RenterContactView } from '@/features/contact/contact-view'

// How the renter is reached, for their own pages (architecture.md section 12.3), with only enough of the number to
// recognise it, and the last few texts a demo shop showed instead of sending.
export async function renterContactView(transaction: Transaction, rentalId: string, state: RentalState): Promise<RenterContactView> {
  const contact = await renterContact(transaction, rentalId)
  const shown = await shownTexts(transaction, rentalId)
  return {
    channel: contact?.channel ?? 'email',
    phone: contact?.phone == null ? null : maskedPhone(contact.phone),
    confirmed: contact?.phoneConfirmed ?? false,
    locked: contactChangeNeedsCode(state),
    shown: shown.slice(-3).map((text) => ({ id: text.id, body: text.body ?? '' })),
  }
}
