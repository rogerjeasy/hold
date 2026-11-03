import type { HoldState, RentalState } from '@hold/domain'
import { and, asc, eq, gt, inArray, lt, ne, notInArray } from 'drizzle-orm'
import { holds, items, itemTypes, rentalItems, rentals, renters } from './schema/index.ts'
import type { Transaction } from './scope.ts'
import { rentalName } from './rental-name.ts'

// The shop's calendar (extensions.md section 12.5): every item it still rents out as a row, and every rental that
// overlaps the window as a bar on each item it took, with where its PayPal hold stands. Read inside one shop.

export type CalendarItem = { readonly id: string; readonly label: string; readonly typeName: string; readonly simulated: boolean }
export type CalendarBooking = {
  readonly rentalId: string
  readonly itemId: string
  readonly startsAt: Date
  readonly endsAt: Date
  readonly renterName: string | null
  readonly rentalState: RentalState
  // Nothing before staff ask for the hold.
  readonly holdState: HoldState | null
  readonly simulated: boolean
}
export type ShopCalendar = { readonly items: readonly CalendarItem[]; readonly bookings: readonly CalendarBooking[] }

// Rentals that never started hold no item.
const NEVER_STARTED: RentalState[] = ['cancelled', 'abandoned']

export async function shopCalendar(transaction: Transaction, window: { readonly from: Date; readonly to: Date }): Promise<ShopCalendar> {
  const rows = await transaction
    .select({ id: items.id, label: items.label, typeName: itemTypes.name, simulated: items.simulated })
    .from(items)
    .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
    .where(ne(items.status, 'retired'))
    .orderBy(asc(itemTypes.name), asc(items.label))
  if (rows.length === 0) return { items: [], bookings: [] }
  const bookings = await transaction
    .select({ rentalId: rentals.id, itemId: rentalItems.itemId, startsAt: rentals.startsAt, endsAt: rentals.endsAt, renterName: rentalName, rentalState: rentals.state, holdState: holds.state, simulated: rentals.simulated })
    .from(rentalItems)
    .innerJoin(rentals, eq(rentals.id, rentalItems.rentalId))
    .leftJoin(holds, eq(holds.rentalId, rentals.id))
    .leftJoin(renters, eq(renters.id, rentals.renterId))
    .where(and(lt(rentals.startsAt, window.to), gt(rentals.endsAt, window.from), notInArray(rentals.state, NEVER_STARTED), inArray(rentalItems.itemId, rows.map((row) => row.id))))
    .orderBy(asc(rentals.startsAt))
  return { items: rows, bookings }
}
