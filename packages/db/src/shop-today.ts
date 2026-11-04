import { counterRoutine } from '@hold/domain'
import type { ClaimState, HoldState, RentalState, RoutineTime } from '@hold/domain'
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, lte, ne, notInArray, or, sql } from 'drizzle-orm'
import type { SQLWrapper } from 'drizzle-orm'
import {
  auditLog,
  authorizations,
  captureSessions,
  claimLines,
  claimReplies,
  claims,
  holds,
  items,
  photos,
  moneyEvents,
  priceEntries,
  priceLists,
  rentalItems,
  rentals,
  renters,
  staffRoles,
  users,
} from './schema/index.ts'
import type { Transaction } from './scope.ts'
import { rentalName } from './rental-name.ts'

// What the Today page reads. Plain counts and rows: where a hold stands and what needs a decision are worked out by
// the domain from them, so the rules live in one place.

export type TodayWindow = {
  readonly now: Date
  readonly day: { readonly start: Date; readonly end: Date; readonly monthStart: Date }
}

export type ActiveHold = {
  readonly rentalId: string
  readonly renterName: string | null
  readonly reservedCents: number
  readonly createdAt: Date
  readonly assuredUntil: Date
  readonly validUntil: Date
  readonly simulated: boolean
}

export type ClaimWaiting = {
  readonly claimId: string
  readonly rentalId: string
  readonly renterName: string | null
  readonly state: Extract<ClaimState, 'awaiting_approval' | 'contested'>
  readonly totalCents: number
  readonly firstLine: string | null
  // The renter's own words. Quoted data, shown as written and never acted on.
  readonly renterComment: string | null
  readonly simulated: boolean
}

export type LateRental = { readonly rentalId: string; readonly renterName: string | null; readonly endsAt: Date; readonly simulated: boolean }

// An item a renter returned themselves that nobody has checked yet (architecture.md section 6.13).
export type DroppedOff = { readonly rentalId: string; readonly renterName: string | null; readonly droppedOffAt: Date; readonly simulated: boolean }

export type CounterVisit = {
  readonly rentalId: string
  readonly kind: 'handover' | 'return'
  readonly at: Date
  readonly renterName: string | null
  readonly items: readonly string[]
  readonly done: boolean
  readonly hold: { readonly reservedCents: number; readonly state: HoldState; readonly assuredUntil: Date | null } | null
  readonly simulated: boolean
}

export type ActivityLine = {
  readonly at: Date
  readonly action: string
  readonly actorName: string | null
  readonly renterName: string | null
  readonly simulated: boolean
}

export type ShopToday = {
  readonly rentalsOut: number
  readonly itemsOut: number
  readonly dueBackToday: number
  readonly activeHolds: readonly ActiveHold[]
  readonly claimsWaiting: readonly ClaimWaiting[]
  readonly droppedOff: readonly DroppedOff[]
  readonly late: readonly LateRental[]
  readonly counter: readonly CounterVisit[]
  readonly month: { readonly feesCents: number; readonly releasedCents: number; readonly claimedCents: number; readonly recoveredCents: number }
  // The month's handovers and returns, timed from opening to seal, each with its count (counterRoutine).
  readonly routine: { readonly handover: RoutineTime; readonly return: RoutineTime }
  readonly activity: readonly ActivityLine[]
  readonly rentals: { readonly total: number; readonly simulated: number }
}

const OUT: readonly RentalState[] = ['out', 'overdue']
const HANDED_OVER: readonly RentalState[] = ['out', 'overdue', 'dropped_off', 'returned', 'inspecting', 'settling', 'closed']
const BACK: readonly RentalState[] = ['dropped_off', 'returned', 'inspecting', 'settling', 'closed']
const HELD: readonly HoldState[] = ['placed', 'renewing', 'at_risk']
const ACTIVITY_LINES = 6
// A character no item label contains.
const ITEM_SEPARATOR = '\u001f'

const count = sql<number>`count(*)::int`
const total = (column: typeof moneyEvents.amountCents | typeof claims.totalCents) => sql<number>`coalesce(sum(${column}), 0)::bigint`.mapWith(Number)

// The day's counts and the month's sums, each a subquery of one statement: deployed, every statement is a call to the
// Data API that the page waits for.
async function figures(transaction: Transaction, window: TodayWindow) {
  const scalar = (query: SQLWrapper) => sql<number>`(${query})`.mapWith(Number)
  const inMonth = and(gte(moneyEvents.occurredAt, window.day.monthStart), lt(moneyEvents.occurredAt, window.now))
  const sumOf = (kinds: (typeof moneyEvents.kind.enumValues)[number][]) =>
    scalar(transaction.select({ cents: total(moneyEvents.amountCents) }).from(moneyEvents).where(and(inMonth, inArray(moneyEvents.kind, kinds))))
  const [row] = await transaction
    .select({
      rentals: scalar(transaction.select({ rentals: count }).from(rentals)),
      simulated: scalar(transaction.select({ rentals: sql<number>`(count(*) filter (where ${rentals.simulated}))::int` }).from(rentals)),
      rentalsOut: scalar(transaction.select({ rentals: count }).from(rentals).where(inArray(rentals.state, OUT))),
      dueBackToday: scalar(transaction.select({ rentals: count }).from(rentals).where(and(inArray(rentals.state, OUT), gte(rentals.endsAt, window.day.start), lt(rentals.endsAt, window.day.end)))),
      itemsOut: scalar(transaction.select({ items: count }).from(rentalItems).innerJoin(rentals, eq(rentals.id, rentalItems.rentalId)).where(inArray(rentals.state, OUT))),
      feesCents: sumOf(['fee_captured', 'extension_captured']),
      releasedCents: sumOf(['hold_released']),
      claimedCents: scalar(
        transaction
          .select({ cents: total(claims.totalCents) })
          .from(claims)
          .where(and(gte(claims.createdAt, window.day.monthStart), lt(claims.createdAt, window.now), notInArray(claims.state, ['draft', 'waived']))),
      ),
      recoveredCents: sumOf(['hold_captured', 'invoice_paid']),
    })
    .from(sql`(select 1) as one`)
  if (row === undefined) throw new Error('The figures returned no row.')
  return row
}

// Every hold still reserved, the one nearest its end first. The decision board reads it too.
export async function activeHolds(transaction: Transaction): Promise<ActiveHold[]> {
  return transaction
    .select({
      rentalId: holds.rentalId,
      renterName: rentalName,
      reservedCents: holds.reservedCents,
      createdAt: authorizations.createdAt,
      assuredUntil: authorizations.assuredUntil,
      validUntil: authorizations.validUntil,
      simulated: rentals.simulated,
    })
    .from(holds)
    .innerJoin(authorizations, eq(authorizations.id, holds.currentAuthorizationId))
    .innerJoin(rentals, eq(rentals.id, holds.rentalId))
    .leftJoin(renters, eq(renters.id, rentals.renterId))
    .where(inArray(holds.state, HELD))
    .orderBy(asc(authorizations.validUntil))
}

async function claimsWaiting(transaction: Transaction): Promise<ClaimWaiting[]> {
  const firstLine = transaction
    .select({ description: priceEntries.description })
    .from(claimLines)
    .innerJoin(priceEntries, eq(priceEntries.id, claimLines.priceEntryId))
    .where(eq(claimLines.claimId, claims.id))
    .orderBy(asc(claimLines.createdAt))
    .limit(1)
  const latestComment = transaction
    .select({ comment: claimReplies.comment })
    .from(claimReplies)
    .where(eq(claimReplies.claimId, claims.id))
    .orderBy(desc(claimReplies.createdAt))
    .limit(1)
  const rows = await transaction
    .select({
      claimId: claims.id,
      rentalId: claims.rentalId,
      renterName: rentalName,
      state: claims.state,
      totalCents: claims.totalCents,
      firstLine: sql<string | null>`(${firstLine})`,
      renterComment: sql<string | null>`(${latestComment})`,
      simulated: rentals.simulated,
    })
    .from(claims)
    .innerJoin(rentals, eq(rentals.id, claims.rentalId))
    .leftJoin(renters, eq(renters.id, rentals.renterId))
    .where(inArray(claims.state, ['awaiting_approval', 'contested']))
    .orderBy(sql`${claims.state} = 'contested'`, asc(claims.createdAt))
  return rows.map((row) => ({ ...row, state: row.state === 'contested' ? 'contested' : 'awaiting_approval' }))
}

async function droppedOff(transaction: Transaction): Promise<DroppedOff[]> {
  const rows = await transaction
    .select({ rentalId: rentals.id, renterName: rentalName, droppedOffAt: rentals.droppedOffAt, simulated: rentals.simulated })
    .from(rentals)
    .leftJoin(renters, eq(renters.id, rentals.renterId))
    .where(eq(rentals.state, 'dropped_off'))
    .orderBy(asc(rentals.droppedOffAt))
  return rows.flatMap((row) => (row.droppedOffAt === null ? [] : [{ ...row, droppedOffAt: row.droppedOffAt }]))
}

// Rentals past their return time and not back. The decision board reads it too.
export async function lateRentals(transaction: Transaction, now: Date): Promise<LateRental[]> {
  return transaction
    .select({ rentalId: rentals.id, renterName: rentalName, endsAt: rentals.endsAt, simulated: rentals.simulated })
    .from(rentals)
    .leftJoin(renters, eq(renters.id, rentals.renterId))
    .where(or(eq(rentals.state, 'overdue'), and(eq(rentals.state, 'out'), lt(rentals.endsAt, now))))
    .orderBy(asc(rentals.endsAt))
}

async function counter(transaction: Transaction, window: TodayWindow): Promise<CounterVisit[]> {
  const { start, end } = window.day
  const startsToday = and(gte(rentals.startsAt, start), lt(rentals.startsAt, end), notInArray(rentals.state, ['pending_payment', 'cancelled', 'abandoned']))
  const endsToday = and(gte(rentals.endsAt, start), lt(rentals.endsAt, end), inArray(rentals.state, [...OUT, ...BACK]))
  const rows = await transaction
    .select({
      rentalId: rentals.id,
      state: rentals.state,
      startsAt: rentals.startsAt,
      endsAt: rentals.endsAt,
      renterName: rentalName,
      simulated: rentals.simulated,
      reservedCents: holds.reservedCents,
      holdState: holds.state,
      assuredUntil: authorizations.assuredUntil,
      // Joined into one text, not an array: the RDS Data API returns arrays awkwardly.
      items: sql<string>`coalesce((select string_agg(${items.label}, ${ITEM_SEPARATOR} order by ${items.label}) from ${rentalItems} join ${items} on ${items.id} = ${rentalItems.itemId} where ${rentalItems.rentalId} = ${rentals.id}), '')`,
    })
    .from(rentals)
    .leftJoin(renters, eq(renters.id, rentals.renterId))
    .leftJoin(holds, eq(holds.rentalId, rentals.id))
    .leftJoin(authorizations, eq(authorizations.id, holds.currentAuthorizationId))
    .where(or(startsToday, endsToday))
  const visits = rows.flatMap((row): CounterVisit[] => {
    const base = {
      rentalId: row.rentalId,
      renterName: row.renterName,
      items: row.items === '' ? [] : row.items.split(ITEM_SEPARATOR),
      simulated: row.simulated,
      hold: row.reservedCents === null || row.holdState === null ? null : { reservedCents: row.reservedCents, state: row.holdState, assuredUntil: row.assuredUntil },
    }
    const visitsOfRow: CounterVisit[] = []
    if (row.startsAt >= start && row.startsAt < end) visitsOfRow.push({ ...base, kind: 'handover', at: row.startsAt, done: HANDED_OVER.includes(row.state) })
    if (row.endsAt >= start && row.endsAt < end && [...OUT, ...BACK].includes(row.state)) visitsOfRow.push({ ...base, kind: 'return', at: row.endsAt, done: BACK.includes(row.state) })
    return visitsOfRow
  })
  return visits.sort((a, b) => a.at.getTime() - b.at.getTime())
}

// The month's sealed sessions. One of a sample rental, or holding a sample photograph, is the demonstration's, and
// counterRoutine leaves it out.
async function routine(transaction: Transaction, window: TodayWindow) {
  const sessions = await transaction
    .select({
      kind: captureSessions.kind,
      startedAt: captureSessions.startedAt,
      sealedAt: captureSessions.sealedAt,
      simulated: sql<boolean>`(${rentals.simulated} or exists (select 1 from ${photos} where ${photos.sessionId} = ${captureSessions.id} and (${photos.quality} ->> 'simulated') = '1'))`,
    })
    .from(captureSessions)
    .innerJoin(rentalItems, eq(rentalItems.id, captureSessions.rentalItemId))
    .innerJoin(rentals, eq(rentals.id, rentalItems.rentalId))
    .where(and(gte(captureSessions.sealedAt, window.day.monthStart), lte(captureSessions.sealedAt, window.now), inArray(captureSessions.kind, ['handover', 'return'])))
  return counterRoutine(sessions)
}

async function activity(transaction: Transaction): Promise<ActivityLine[]> {
  const rows = await transaction
    .select({
      at: auditLog.at,
      action: auditLog.action,
      actorName: users.name,
      renterName: rentalName,
      simulated: sql<boolean>`coalesce(${rentals.simulated}, (${auditLog.detail} ->> 'simulated')::boolean, false)`,
    })
    .from(auditLog)
    .leftJoin(users, eq(sql`${users.id}::text`, auditLog.actorId))
    .leftJoin(rentals, and(eq(auditLog.subjectKind, 'rental'), eq(sql`${rentals.id}::text`, auditLog.subjectId)))
    .leftJoin(renters, eq(renters.id, rentals.renterId))
    .orderBy(desc(auditLog.at))
    .limit(ACTIVITY_LINES)
  return rows
}

export async function shopToday(transaction: Transaction, window: TodayWindow): Promise<ShopToday> {
  const { rentals: total, simulated, rentalsOut, dueBackToday, itemsOut, ...month } = await figures(transaction, window)
  return {
    rentalsOut,
    dueBackToday,
    itemsOut,
    activeHolds: await activeHolds(transaction),
    claimsWaiting: await claimsWaiting(transaction),
    droppedOff: await droppedOff(transaction),
    late: await lateRentals(transaction, window.now),
    counter: await counter(transaction, window),
    month,
    routine: await routine(transaction, window),
    activity: await activity(transaction),
    rentals: { total, simulated },
  }
}

// What the Today page's setup list checks: a published price list, the shop's own items still in use (the samples left
// aside), and how many people are on its staff. One statement, where reading the lists themselves took seven.
export type ShopSetup = { readonly pricesPublished: boolean; readonly ownItems: number; readonly staff: number }

export async function shopSetup(transaction: Transaction): Promise<ShopSetup> {
  const [row] = await transaction
    .select({
      pricesPublished: sql<boolean>`exists (${transaction.select({ id: priceLists.id }).from(priceLists).where(isNotNull(priceLists.publishedAt))})`,
      ownItems: sql<number>`(${transaction.select({ items: count }).from(items).where(and(eq(items.simulated, false), ne(items.status, 'retired')))})`.mapWith(Number),
      staff: sql<number>`(${transaction.select({ people: count }).from(staffRoles)})`.mapWith(Number),
    })
    .from(sql`(select 1) as one`)
  if (row === undefined) throw new Error('The setup returned no row.')
  return row
}
