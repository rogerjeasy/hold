import { addDays, closedOutcome, countsTowardRecord, INVOICE_DUE_DAYS, money, outcomeNow } from '@hold/domain'
import type { ItemCategory, ItemHold, MoneyLogLine, OutcomeClass, OutcomeRow, PastRental, StoredOutcome, TrustLadder } from '@hold/domain'
import { asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { items, itemTypes, moneyEvents, rentalItems, rentalOutcomes, rentals, renters, shops, trustLadders, trustRungs } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// The Clean Record and the trust ladder (extensions.md section 7): the shop's published ladder, each rental's outcome,
// and, through the functions of migration 0021, a renter's record across shops and their consent. A shop never learns
// where else a renter rented: other shops' outcomes arrive numbered, never named.

const HOUR = 3_600_000

export type PublishedTrustLadder = { readonly id: string; readonly version: number; readonly publishedAt: Date; readonly ladder: TrustLadder }

// The shop's latest published ladder, which every new hold is placed under. Nothing before the first.
export async function currentTrustLadder(transaction: Transaction): Promise<PublishedTrustLadder | undefined> {
  const [row] = await transaction.select().from(trustLadders).orderBy(desc(trustLadders.version)).limit(1)
  return row === undefined ? undefined : publishedLadder(transaction, row)
}

export async function trustLadderById(transaction: Transaction, ladderId: string): Promise<PublishedTrustLadder | undefined> {
  const [row] = await transaction.select().from(trustLadders).where(eq(trustLadders.id, ladderId))
  return row === undefined ? undefined : publishedLadder(transaction, row)
}

async function publishedLadder(transaction: Transaction, row: typeof trustLadders.$inferSelect): Promise<PublishedTrustLadder> {
  const rungs = await transaction.select().from(trustRungs).where(eq(trustRungs.ladderId, row.id)).orderBy(asc(trustRungs.position))
  return {
    id: row.id,
    version: row.version,
    publishedAt: row.publishedAt,
    ladder: {
      currency: row.currency,
      history: row.history,
      windowMonths: row.windowMonths,
      minimumFee: money(row.minimumFeeCents, row.currency),
      minimumHours: row.minimumHours,
      rungs: rungs.map((rung) => ({
        cleanReturns: rung.cleanReturns,
        sharePercent: rung.sharePercent,
        largestValue: rung.largestValueCents === null ? undefined : money(rung.largestValueCents, row.currency),
        needsSavedMethod: rung.needsSavedMethod,
      })),
    },
  }
}

export type LadderPublishResult = { readonly ok: true; readonly version: number } | { readonly ok: false; readonly reason: 'currency_mismatch' }

// Publishes the next version, whole. The caller has checked it with checkLadder. It is in the shop's own currency.
export async function publishTrustLadder(transaction: Transaction, shopId: string, userId: string, ladder: TrustLadder, now: Date): Promise<LadderPublishResult> {
  const [shop] = await transaction.select({ currency: shops.currency }).from(shops).where(eq(shops.id, shopId))
  if (shop?.currency !== ladder.currency) return { ok: false, reason: 'currency_mismatch' }
  const [latest] = await transaction.select({ version: sql<number>`coalesce(max(${trustLadders.version}), 0)::int` }).from(trustLadders)
  const version = (latest?.version ?? 0) + 1
  const [created] = await transaction
    .insert(trustLadders)
    .values({ shopId, version, currency: ladder.currency, history: ladder.history, windowMonths: ladder.windowMonths, minimumFeeCents: ladder.minimumFee.cents, minimumHours: ladder.minimumHours, publishedByUserId: userId, publishedAt: now })
    .returning({ id: trustLadders.id })
  if (created === undefined) throw new Error('The trust ladder was not created.')
  if (ladder.rungs.length > 0) {
    await transaction.insert(trustRungs).values(
      ladder.rungs.map((rung, index) => ({ shopId, ladderId: created.id, position: index + 1, cleanReturns: rung.cleanReturns, sharePercent: rung.sharePercent, largestValueCents: rung.largestValue?.cents ?? null, needsSavedMethod: rung.needsSavedMethod })),
    )
  }
  return { ok: true, version }
}

// The renter key of the payer who paid the rental's fee, kept on the renter the first time, so the rental's outcome
// can be written when it closes without Hold's secret. Nothing before PayPal has said who paid.
export async function renterTrustKey(transaction: Transaction, rentalId: string, keyFor: (payerId: string) => string): Promise<string | undefined> {
  const [renter] = await transaction
    .select({ id: renters.id, payerId: renters.paypalPayerId, trustKey: renters.trustKey })
    .from(rentals)
    .innerJoin(renters, eq(renters.id, rentals.renterId))
    .where(eq(rentals.id, rentalId))
  if (renter === undefined) return undefined
  if (renter.trustKey !== null) return renter.trustKey
  const key = keyFor(renter.payerId)
  const [set] = await transaction.select({ set: sql<boolean>`result.set` }).from(sql`hold_set_renter_trust_key(${renter.id}::uuid, ${key}) as result(set)`)
  return set?.set === true ? key : undefined
}

export type TrustOutcome = OutcomeRow & { readonly here: boolean }

// The renter's outcomes this transaction may see: the shop's own; others' with the renter's consent; all of them for
// the renter through their own link.
export async function trustOutcomes(transaction: Transaction, renterKey: string): Promise<readonly TrustOutcome[]> {
  const rows = await transaction
    .select({
      outcome: sql<StoredOutcome>`outcome.outcome`,
      closedAt: sql<string>`outcome.closed_at`,
      counts: sql<boolean>`outcome.counts`,
      unpaidAfter: sql<string | null>`outcome.unpaid_after`,
      shop: sql<number>`outcome.shop_number`,
      here: sql<boolean>`outcome.here`,
    })
    .from(sql`hold_trust_outcomes(${renterKey}) as outcome`)
  // Read through a function, so the times arrive as text.
  return rows.map((row) => ({ outcome: row.outcome, closedAt: new Date(row.closedAt), counts: row.counts, unpaidAfter: row.unpaidAfter === null ? null : new Date(row.unpaidAfter), shop: String(row.shop), here: row.here }))
}

export type TrustConsent = { readonly answered: boolean; readonly consented: boolean }

// Nothing for a renter the shop never served.
export async function trustConsent(transaction: Transaction, renterKey: string): Promise<TrustConsent | undefined> {
  const [row] = await transaction.select({ answered: sql<boolean>`consent.answered`, consented: sql<boolean>`consent.consented` }).from(sql`hold_trust_consent(${renterKey}) as consent`)
  return row
}

// The renter's answer, given through their own link. False when the caller may not answer for them.
export async function answerTrustConsent(transaction: Transaction, renterKey: string, consent: boolean, now: Date): Promise<boolean> {
  const [row] = await transaction.select({ done: sql<boolean>`result.done` }).from(sql`hold_answer_trust_consent(${renterKey}, ${consent}, ${now.toISOString()}::timestamptz) as result(done)`)
  return row?.done === true
}

// Deletes the renter's clean and settled returns at every shop, and withdraws their consent. How many returns went,
// or nothing when the caller may not.
export async function deleteTrustRecord(transaction: Transaction, renterKey: string, now: Date): Promise<number | undefined> {
  const [row] = await transaction.select({ removed: sql<number | null>`result.removed` }).from(sql`hold_delete_trust_record(${renterKey}, ${now.toISOString()}::timestamptz) as result(removed)`)
  return row?.removed ?? undefined
}

// The holds released and captured on the renter's rentals at every shop, for the renter's own page.
export async function trustMoneyLog(transaction: Transaction, renterKey: string): Promise<readonly MoneyLogLine[]> {
  const rows = await transaction
    .select({ rental: sql<string>`line.rental_id`, kind: sql<string>`line.kind`, currency: sql<string>`line.currency`, cents: sql<number | string>`line.amount_cents` })
    .from(sql`hold_trust_money_log(${renterKey}) as line`)
  // A bigint read through a function may arrive as text.
  return rows.map((row) => ({ rental: row.rental, kind: row.kind, amount: money(Number(row.cents), row.currency) }))
}

// What decides a rental's outcome: what was taken for its claim in the end, and whether it builds a record.
async function outcomeFacts(transaction: Transaction, rentalId: string) {
  const [rental] = await transaction
    .select({ shopId: rentals.shopId, startsAt: rentals.startsAt, endsAt: rentals.endsAt, feeCents: rentals.feeCents, currency: rentals.currency, simulated: rentals.simulated, renterKey: renters.trustKey })
    .from(rentals)
    .leftJoin(renters, eq(renters.id, rentals.renterId))
    .where(eq(rentals.id, rentalId))
  if (rental?.renterKey === null || rental?.renterKey === undefined) return undefined
  const events = await transaction.select({ kind: moneyEvents.kind, cents: moneyEvents.amountCents }).from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId))
  const ladder = await currentTrustLadder(transaction)
  const [mostValuable] = await transaction
    .select({ category: itemTypes.category })
    .from(rentalItems)
    .innerJoin(items, eq(items.id, rentalItems.itemId))
    .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
    .where(eq(rentalItems.rentalId, rentalId))
    .orderBy(desc(rentalItems.holdCents))
    .limit(1)
  const counts = countsTowardRecord(
    { feeCaptured: events.some((event) => event.kind === 'fee_captured'), fee: money(rental.feeCents, rental.currency), hours: (rental.endsAt.getTime() - rental.startsAt.getTime()) / HOUR, simulated: rental.simulated },
    ladder === undefined ? undefined : { fee: ladder.ladder.minimumFee, hours: ladder.ladder.minimumHours },
  )
  return { shopId: rental.shopId, renterKey: rental.renterKey, itemCategory: mostValuable?.category ?? 'other', counts, takenCents: takenFor(events) }
}

// Captured from the hold, plus an invoice paid, less what was refunded.
function takenFor(events: readonly { readonly kind: string; readonly cents: number }[]): number {
  const sum = (kind: string) => events.filter((event) => event.kind === kind).reduce((total, event) => total + event.cents, 0)
  return Math.max(0, sum('hold_captured') + sum('invoice_paid') - sum('refunded'))
}

// Written in the transaction that closes the rental. An open outcome written while its invoice waited becomes settled.
export async function writeRentalOutcome(transaction: Transaction, rentalId: string, now: Date): Promise<void> {
  const facts = await outcomeFacts(transaction, rentalId)
  if (facts === undefined) return
  const outcome = closedOutcome(facts)
  await transaction
    .insert(rentalOutcomes)
    .values({ shopId: facts.shopId, rentalId, renterKey: facts.renterKey, itemCategory: facts.itemCategory, closedAt: now, outcome, counts: facts.counts })
    .onConflictDoUpdate({ target: rentalOutcomes.rentalId, set: { outcome, closedAt: now, counts: facts.counts, unpaidAfter: null } })
}

// An invoice for a decided claim was sent and not yet paid: the rental is open, and unpaid once the invoice is due.
export async function markOutcomeOpen(transaction: Transaction, rentalId: string, now: Date): Promise<void> {
  const facts = await outcomeFacts(transaction, rentalId)
  if (facts === undefined) return
  await transaction
    .insert(rentalOutcomes)
    .values({ shopId: facts.shopId, rentalId, renterKey: facts.renterKey, itemCategory: facts.itemCategory, closedAt: now, outcome: 'open', counts: facts.counts, unpaidAfter: addDays(now, INVOICE_DUE_DAYS) })
    .onConflictDoNothing()
}

export type LedgerLine = { readonly rentalId: string; readonly outcome: OutcomeClass; readonly closedAt: Date; readonly counts: boolean; readonly itemCategory: ItemCategory }

// The shop's own trust ledger, newest first.
export async function shopOutcomes(transaction: Transaction, now: Date, limit = 50): Promise<readonly LedgerLine[]> {
  const rows = await transaction.select().from(rentalOutcomes).orderBy(desc(rentalOutcomes.closedAt)).limit(limit)
  return rows.map((row) => ({ rentalId: row.rentalId, outcome: outcomeNow({ ...row, shop: row.shopId }, now), closedAt: row.closedAt, counts: row.counts, itemCategory: row.itemCategory }))
}

// Each item of the rental with the hold agreed for it at booking and what its type is worth, for the ladder's value
// cover.
export async function rentalItemHolds(transaction: Transaction, rentalId: string): Promise<readonly ItemHold[]> {
  const rows = await transaction
    .select({ holdCents: rentalItems.holdCents, valueCents: itemTypes.valueCents, currency: itemTypes.currency })
    .from(rentalItems)
    .innerJoin(items, eq(items.id, rentalItems.itemId))
    .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
    .where(eq(rentalItems.rentalId, rentalId))
  return rows.map((row) => ({ hold: money(row.holdCents, row.currency), value: money(row.valueCents, row.currency) }))
}

// The shop's closed rentals, for replaying a candidate ladder over them (extensions.md section 7.8). What was taken
// comes from the money log, so sample rentals replay too.
export async function pastRentalsForSimulation(transaction: Transaction): Promise<readonly PastRental[]> {
  const closed = await transaction
    .select({ id: rentals.id, renterId: rentals.renterId, startsAt: rentals.startsAt, endsAt: rentals.endsAt, feeCents: rentals.feeCents, currency: rentals.currency, closedAt: rentalOutcomes.closedAt })
    .from(rentals)
    .leftJoin(rentalOutcomes, eq(rentalOutcomes.rentalId, rentals.id))
    .where(eq(rentals.state, 'closed'))
    .orderBy(asc(rentals.startsAt))
  const known = closed.filter((rental) => rental.renterId !== null)
  if (known.length === 0) return []
  const ids = known.map((rental) => rental.id)
  const held = await transaction
    .select({ rentalId: rentalItems.rentalId, holdCents: rentalItems.holdCents, valueCents: itemTypes.valueCents })
    .from(rentalItems)
    .innerJoin(items, eq(items.id, rentalItems.itemId))
    .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
    .where(inArray(rentalItems.rentalId, ids))
  const events = await transaction.select({ rentalId: moneyEvents.rentalId, kind: moneyEvents.kind, cents: moneyEvents.amountCents }).from(moneyEvents).where(inArray(moneyEvents.rentalId, ids))
  return known.map((rental) => {
    const own = events.filter((event) => event.rentalId === rental.id)
    const takenCents = takenFor(own)
    return {
      renter: rental.renterId ?? '',
      startsAt: rental.startsAt,
      closedAt: rental.closedAt ?? rental.endsAt,
      outcome: closedOutcome({ takenCents }),
      feeCaptured: own.some((event) => event.kind === 'fee_captured'),
      fee: money(rental.feeCents, rental.currency),
      hours: (rental.endsAt.getTime() - rental.startsAt.getTime()) / HOUR,
      items: held.filter((item) => item.rentalId === rental.id).map((item) => ({ hold: money(item.holdCents, rental.currency), value: money(item.valueCents, rental.currency) })),
      claimCents: takenCents,
    }
  })
}
