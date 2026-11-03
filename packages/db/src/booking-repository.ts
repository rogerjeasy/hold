import { blocksItem, bookingTerms, checkBooking, maskedPhone, money, paymentLapsed, placementStrategy, RENTAL_TRANSITIONS, rentalDays, transition } from '@hold/domain'
import type { BookingTerms, ContactChannel, ItemCategory, Period, PlacementStrategy, RentalState } from '@hold/domain'
import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm'
import { holds, items, itemTypes, priceLists, rentalItems, rentals, renterLinks, renters, shops, wearPolicies } from './schema/index.ts'
import type { BookingChannel } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// Bookings, made by staff or by a renter on the shop's page (architecture.md section 6.5). A booking waits for its
// fee, keeping its items for fifteen minutes. Amounts come from the item types, never from whoever books.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Occupancy = Period & { readonly state: RentalState; readonly createdAt: Date }

// Every item of the given types the shop could rent, with the rentals that might keep it.
async function itemsWithRentals(transaction: Transaction, typeIds: readonly string[] | 'all', lock: boolean) {
  const own = and(eq(items.status, 'in_service'), eq(items.simulated, false), typeIds === 'all' ? undefined : inArray(items.itemTypeId, [...typeIds]))
  const query = transaction.select({ id: items.id, itemTypeId: items.itemTypeId, label: items.label }).from(items).where(own)
  // Locked so two bookings made at once cannot take the same item.
  const rows = lock ? await query.for('update') : await query
  if (rows.length === 0) return []
  const occupancy = await transaction
    .select({ itemId: rentalItems.itemId, state: rentals.state, startsAt: rentals.startsAt, endsAt: rentals.endsAt, createdAt: rentals.createdAt })
    .from(rentalItems)
    .innerJoin(rentals, eq(rentals.id, rentalItems.rentalId))
    .where(and(inArray(rentalItems.itemId, rows.map((row) => row.id)), sql`${rentals.state} not in ('closed', 'cancelled', 'abandoned')`))
  const byItem = new Map<string, Occupancy[]>()
  for (const { itemId, ...rental } of occupancy) byItem.set(itemId, [...(byItem.get(itemId) ?? []), rental])
  return rows
    .map((row) => ({ ...row, rentals: byItem.get(row.id) ?? [] }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }))
}

const free = (item: { readonly rentals: readonly Occupancy[] }, period: Period, now: Date) => !item.rentals.some((rental) => blocksItem(rental, period, now))

export type BookableType = {
  readonly id: string
  readonly name: string
  readonly category: ItemCategory
  readonly currency: string
  readonly dayRateCents: number
  readonly holdCents: number
  readonly available: number
}

// The shop's own item types, each with how many of its items are free for the period.
export async function bookableTypes(transaction: Transaction, period: Period, now: Date): Promise<readonly BookableType[]> {
  const types = await transaction
    .select({ id: itemTypes.id, name: itemTypes.name, category: itemTypes.category, currency: itemTypes.currency, dayRateCents: itemTypes.dayRateCents, holdCents: itemTypes.holdCents })
    .from(itemTypes)
    .where(eq(itemTypes.simulated, false))
    .orderBy(asc(itemTypes.name))
  const all = await itemsWithRentals(transaction, 'all', false)
  return types.map((type) => ({ ...type, available: all.filter((item) => item.itemTypeId === type.id && free(item, period, now)).length }))
}

export type NewBooking = Period & {
  readonly lines: readonly { readonly itemTypeId: string; readonly count: number }[]
  // A phone, in the international form, makes texts the way the renter is reached until they choose otherwise on their
  // own page (architecture.md section 12.3). A one-time code goes to it only once they confirm it.
  readonly contact: { readonly name: string; readonly email: string; readonly phone?: string } | undefined
  readonly language: string
  readonly bookedThrough: BookingChannel
  // How staff asked for the hold to be placed: combined for a walk-in who approves the fee and the hold once. Only
  // honoured for a rental at the counter that starts today (placementStrategy).
  readonly placement?: PlacementStrategy
  // The renter link sent or shown with the booking. Only its fingerprint is kept.
  readonly link: { readonly fingerprint: string; readonly expiresAt: Date }
}

export type BookingResult =
  | { readonly ok: true; readonly rentalId: string }
  | { readonly ok: false; readonly reason: 'not_available'; readonly itemTypeId: string }
  | { readonly ok: false; readonly reason: string }

// A booking's link pays the fee and approves the hold, and during the rental reports what happened (extensions.md 10).
export const BOOKING_LINK_SCOPES = ['view', 'pay', 'extend', 'report_incident', 'return_item']

export type PricedBooking = {
  readonly currency: string
  readonly terms: BookingTerms
  // Each line with its type's name, as the shop wrote it.
  readonly names: ReadonlyMap<string, string>
  readonly priceList: { readonly id: string; readonly version: number }
  readonly wearPolicyId: string
}

export type PriceResult = { readonly ok: true; readonly priced: PricedBooking } | { readonly ok: false; readonly reason: string }

// What a booking of these lines for this period would cost and hold, from the shop's item types and its current price
// list. The one place a booking is priced, whether it is then made at once or quoted to an assistant first.
export async function priceBooking(transaction: Transaction, shopId: string, booking: Period & Pick<NewBooking, 'lines'>, now: Date): Promise<PriceResult> {
  const typeIds = booking.lines.map((line) => line.itemTypeId)
  if (!typeIds.every((id) => UUID.test(id)) || new Set(typeIds).size !== typeIds.length) return { ok: false, reason: 'not_found' }
  // Read inside the caller's shop: an id from another shop is simply not there.
  const types = typeIds.length === 0 ? [] : await transaction.select().from(itemTypes).where(and(inArray(itemTypes.id, typeIds), eq(itemTypes.simulated, false)))
  if (types.length !== typeIds.length) return { ok: false, reason: 'not_found' }
  const [shop] = await transaction.select({ currency: shops.currency }).from(shops).where(eq(shops.id, shopId))
  if (shop?.currency == null) return { ok: false, reason: 'currency_unset' }
  const { currency } = shop
  const lines = booking.lines.map((line) => {
    const type = types.find((candidate) => candidate.id === line.itemTypeId)
    if (type === undefined) throw new Error('A booked type was not read.')
    return { itemTypeId: type.id, count: line.count, dayRate: money(type.dayRateCents, type.currency), hold: money(type.holdCents, type.currency) }
  })
  const [problem] = checkBooking({ startsAt: booking.startsAt, endsAt: booking.endsAt, now, currency, lines })
  if (problem !== undefined) return { ok: false, reason: 'line' in problem ? `${problem.kind}:${String(problem.line)}` : problem.kind }

  const [list] = await transaction
    .select({ id: priceLists.id, version: priceLists.version })
    .from(priceLists)
    .where(isNotNull(priceLists.publishedAt))
    .orderBy(desc(priceLists.version))
    .limit(1)
  const [wear] = list === undefined ? [] : await transaction.select({ id: wearPolicies.id }).from(wearPolicies).where(and(eq(wearPolicies.version, list.version), isNotNull(wearPolicies.publishedAt)))
  if (list === undefined || wear === undefined) return { ok: false, reason: 'no_price_list' }
  const terms = bookingTerms(lines, rentalDays(booking.startsAt, booking.endsAt), currency)
  return { ok: true, priced: { currency, terms, names: new Map(types.map((type) => [type.id, type.name])), priceList: list, wearPolicyId: wear.id } }
}

export async function createBooking(transaction: Transaction, shopId: string, booking: NewBooking, now: Date): Promise<BookingResult> {
  const priced = await priceBooking(transaction, shopId, booking, now)
  if (!priced.ok) return priced
  const { currency, terms, priceList: list, wearPolicyId } = priced.priced

  const candidates = await itemsWithRentals(transaction, booking.lines.map((line) => line.itemTypeId), true)
  const chosen: { readonly itemId: string; readonly dayRateCents: number; readonly holdCents: number }[] = []
  for (const line of terms.lines) {
    const freeItems = candidates.filter((item) => item.itemTypeId === line.itemTypeId && free(item, booking, now)).slice(0, line.count)
    if (freeItems.length < line.count) return { ok: false, reason: 'not_available', itemTypeId: line.itemTypeId }
    chosen.push(...freeItems.map((item) => ({ itemId: item.id, dayRateCents: line.dayRate.cents, holdCents: line.hold.cents })))
  }

  const [rental] = await transaction
    .insert(rentals)
    .values({
      shopId,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      currency,
      feeCents: terms.fee.cents,
      holdCents: terms.hold.cents,
      priceListId: list.id,
      wearPolicyId,
      contactName: booking.contact?.name.trim() ?? null,
      contactEmail: booking.contact === undefined || booking.contact.email.trim() === '' ? null : booking.contact.email.trim().toLowerCase(),
      contactPhone: booking.contact?.phone ?? null,
      contactChannel: booking.contact?.phone === undefined ? 'email' : 'text',
      language: booking.language,
      bookedThrough: booking.bookedThrough,
      createdAt: now,
    })
    .returning({ id: rentals.id })
  if (rental === undefined) throw new Error('The rental was not created.')
  await transaction.insert(rentalItems).values(chosen.map((item) => ({ ...item, shopId, rentalId: rental.id })))
  // A walk-in's hold is asked for now, at the ordinary amount: its one approval comes before Hold knows the renter.
  const [shop] = await transaction.select({ timeZone: shops.timeZone }).from(shops).where(eq(shops.id, shopId))
  if (shop !== undefined && placementStrategy({ asked: booking.placement ?? 'at_counter', bookedThrough: booking.bookedThrough, startsAt: booking.startsAt, timeZone: shop.timeZone, now }) === 'combined') {
    await transaction.insert(holds).values({ shopId, rentalId: rental.id, currency, ordinaryCents: terms.hold.cents, reservedCents: terms.hold.cents, strategy: 'combined', createdAt: now })
  }
  await issueRenterLink(transaction, shopId, rental.id, booking.link, BOOKING_LINK_SCOPES)
  return { ok: true, rentalId: rental.id }
}

// A further link to the same rental, for showing at the counter or sending again. Earlier links keep working.
export async function issueRenterLink(
  transaction: Transaction,
  shopId: string,
  rentalId: string,
  link: { readonly fingerprint: string; readonly expiresAt: Date },
  scopes: readonly string[],
): Promise<void> {
  await transaction.insert(renterLinks).values({ shopId, rentalId, tokenFingerprint: link.fingerprint, scopes, expiresAt: link.expiresAt })
}

export type RentalSummary = {
  readonly id: string
  readonly state: RentalState
  readonly startsAt: Date
  readonly endsAt: Date
  // The renter PayPal named, or the person staff booked for until then.
  readonly who: string | null
  readonly items: readonly string[]
  readonly feeCents: number
  readonly holdCents: number
  readonly currency: string
  readonly bookedThrough: BookingChannel
  readonly simulated: boolean
  // An unpaid booking past its fifteen minutes. It no longer keeps its items.
  readonly paymentLapsed: boolean
}

const ITEM_SEPARATOR = '\u001f'

const summaryColumns = {
  id: rentals.id,
  state: rentals.state,
  startsAt: rentals.startsAt,
  endsAt: rentals.endsAt,
  renterName: renters.name,
  contactName: rentals.contactName,
  feeCents: rentals.feeCents,
  holdCents: rentals.holdCents,
  currency: rentals.currency,
  bookedThrough: rentals.bookedThrough,
  simulated: rentals.simulated,
  createdAt: rentals.createdAt,
  items: sql<string>`coalesce((select string_agg(${items.label}, ${ITEM_SEPARATOR} order by ${items.label}) from ${rentalItems} join ${items} on ${items.id} = ${rentalItems.itemId} where ${rentalItems.rentalId} = ${rentals.id}), '')`,
}

type SummaryRow = {
  readonly id: string
  readonly state: RentalState
  readonly startsAt: Date
  readonly endsAt: Date
  readonly renterName: string | null
  readonly contactName: string | null
  readonly feeCents: number
  readonly holdCents: number
  readonly currency: string
  readonly bookedThrough: BookingChannel
  readonly simulated: boolean
  readonly createdAt: Date
  readonly items: string
}

function toSummary(row: SummaryRow, now: Date): RentalSummary {
  return {
    id: row.id,
    state: row.state,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    who: row.renterName ?? row.contactName,
    items: row.items === '' ? [] : row.items.split(ITEM_SEPARATOR),
    feeCents: row.feeCents,
    holdCents: row.holdCents,
    currency: row.currency,
    bookedThrough: row.bookedThrough,
    simulated: row.simulated,
    paymentLapsed: row.state === 'pending_payment' && paymentLapsed(row.createdAt, now),
  }
}

// The shop's rentals, the latest booked first.
export async function rentalList(transaction: Transaction, now: Date): Promise<readonly RentalSummary[]> {
  const rows = await transaction.select(summaryColumns).from(rentals).leftJoin(renters, eq(renters.id, rentals.renterId)).orderBy(desc(rentals.createdAt)).limit(500)
  return rows.map((row) => toSummary(row, now))
}

export type BookedItem = { readonly id: string; readonly label: string; readonly typeName: string }

export type RentalDetail = Omit<RentalSummary, 'items'> & {
  readonly contactName: string | null
  readonly contactEmail: string | null
  // How the renter is reached, and their number masked (architecture.md section 12.3).
  readonly contactChannel: ContactChannel
  readonly contactPhone: string | null
  readonly renterName: string | null
  readonly language: string
  readonly createdAt: Date
  readonly priceListVersion: number
  readonly items: readonly BookedItem[]
  // When the owner erased the renter's personal details from this ended rental (architecture.md section 15.2).
  readonly renterErasedAt: Date | null
}

export async function rentalDetail(transaction: Transaction, rentalId: string, now: Date): Promise<RentalDetail | undefined> {
  if (!UUID.test(rentalId)) return undefined
  const [row] = await transaction
    .select({ ...summaryColumns, contactEmail: rentals.contactEmail, contactChannel: rentals.contactChannel, contactPhone: rentals.contactPhone, language: rentals.language, priceListVersion: priceLists.version, renterErasedAt: rentals.renterErasedAt })
    .from(rentals)
    .leftJoin(renters, eq(renters.id, rentals.renterId))
    .innerJoin(priceLists, eq(priceLists.id, rentals.priceListId))
    .where(eq(rentals.id, rentalId))
  if (row === undefined) return undefined
  const booked = await transaction
    .select({ id: items.id, label: items.label, typeName: itemTypes.name })
    .from(rentalItems)
    .innerJoin(items, eq(items.id, rentalItems.itemId))
    .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
    .where(eq(rentalItems.rentalId, rentalId))
  const summary = toSummary(row, now)
  return {
    ...summary,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactChannel: row.contactChannel === 'text' ? 'text' : 'email',
    contactPhone: row.contactPhone === null ? null : maskedPhone(row.contactPhone),
    renterName: row.renterName,
    language: row.language,
    createdAt: row.createdAt,
    priceListVersion: row.priceListVersion,
    items: booked.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })),
    renterErasedAt: row.renterErasedAt,
  }
}

export type AbandonResult = { readonly ok: true } | { readonly ok: false; readonly reason: 'not_found' | 'transition_not_allowed' }

// Lets go of a booking whose fee was not paid, so its items are free again. A paid booking is not cancelled here:
// that would need the fee refunded.
export async function abandonBooking(transaction: Transaction, rentalId: string): Promise<AbandonResult> {
  if (!UUID.test(rentalId)) return { ok: false, reason: 'not_found' }
  const [rental] = await transaction.select({ state: rentals.state }).from(rentals).where(eq(rentals.id, rentalId))
  if (rental === undefined) return { ok: false, reason: 'not_found' }
  const moved = transition(RENTAL_TRANSITIONS, rental.state, 'abandoned')
  if (!moved.ok) return { ok: false, reason: 'transition_not_allowed' }
  await transaction.update(rentals).set({ state: 'abandoned' }).where(and(eq(rentals.id, rentalId), eq(rentals.state, rental.state)))
  return { ok: true }
}

// Whether no other rental keeps any of this rental's items for its period, now.
export async function itemsStillFree(transaction: Transaction, rentalId: string, now: Date): Promise<boolean> {
  const [rental] = await transaction.select({ startsAt: rentals.startsAt, endsAt: rentals.endsAt }).from(rentals).where(eq(rentals.id, rentalId))
  if (rental === undefined) return false
  const booked = await transaction.select({ itemId: rentalItems.itemId }).from(rentalItems).where(eq(rentalItems.rentalId, rentalId))
  const others = await transaction
    .select({ state: rentals.state, startsAt: rentals.startsAt, endsAt: rentals.endsAt, createdAt: rentals.createdAt })
    .from(rentalItems)
    .innerJoin(rentals, eq(rentals.id, rentalItems.rentalId))
    .where(and(inArray(rentalItems.itemId, booked.map((item) => item.itemId)), ne(rentals.id, rentalId)))
  return booked.length > 0 && !others.some((other) => blocksItem(other, rental, now))
}
