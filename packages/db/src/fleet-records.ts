import type { ClaimState, ItemRentalRecord, ItemRepairs, RentalState } from '@hold/domain'
import { and, count, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { captureSessions, claimLines, claims, comparisons, findings, items, marks, moneyEvents, rentalItems, rentals } from './schema/index.ts'
import { repairCosts } from './repair-repository.ts'
import type { Transaction } from './scope.ts'
import { REFUND_KINDS } from '@hold/domain'

// What the fleet passport reads (extensions.md section 12.5): for every item, each rental that went out with the damage
// the comparison found on the item at the return, the claim lines about the item (those priced from its findings, or
// all of them when it was rented alone), what PayPal collected on the claim, and the marks still open on the item. Plain rows; the domain's itemWear and wearingFastest read them.

export type FleetItemRecord = { readonly itemId: string; readonly rentals: readonly ItemRentalRecord[]; readonly openMarks: number; readonly repairs: ItemRepairs }

// Rentals whose items went out: a booking still to come, or one let go, has nothing to say about an item's wear.
const WENT_OUT: readonly RentalState[] = ['out', 'overdue', 'dropped_off', 'returned', 'inspecting', 'settling', 'closed']
// A claim no person has decided on yet prices nothing.
const UNDECIDED: readonly ClaimState[] = ['draft', 'awaiting_approval']
const DAMAGE = ['new_damage', 'missing_part'] as const

export async function fleetRecords(transaction: Transaction): Promise<FleetItemRecord[]> {
  const shopItems = await transaction.select({ id: items.id }).from(items)
  if (shopItems.length === 0) return []

  const rented = await transaction
    .select({ rentalItemId: rentalItems.id, itemId: rentalItems.itemId, rentalId: rentals.id, startsAt: rentals.startsAt, endsAt: rentals.endsAt, claimState: claims.state, claimTotalCents: claims.totalCents })
    .from(rentalItems)
    .innerJoin(rentals, eq(rentals.id, rentalItems.rentalId))
    .leftJoin(claims, eq(claims.rentalId, rentals.id))
    .where(inArray(rentals.state, [...WENT_OUT]))
  const rentalItemIds = rented.map((row) => row.rentalItemId)
  const rentalIds = [...new Set(rented.map((row) => row.rentalId))]

  // The damage found at each rental item's return, through the comparison of its return session.
  const found = rentalItemIds.length === 0 ? [] : await transaction
    .select({ rentalItemId: captureSessions.rentalItemId, damage: count(findings.id) })
    .from(findings)
    .innerJoin(comparisons, eq(comparisons.id, findings.comparisonId))
    .innerJoin(captureSessions, eq(captureSessions.id, comparisons.returnSessionId))
    .where(and(inArray(findings.class, [...DAMAGE]), inArray(captureSessions.rentalItemId, rentalItemIds)))
    .groupBy(captureSessions.rentalItemId)
  const priced = rentalItemIds.length === 0 ? [] : await transaction
    .select({ rentalItemId: captureSessions.rentalItemId, cents: sql<number>`coalesce(sum(${claimLines.amountCents}), 0)::bigint`.mapWith(Number) })
    .from(claimLines)
    .innerJoin(claims, eq(claims.id, claimLines.claimId))
    .innerJoin(findings, eq(findings.id, claimLines.findingId))
    .innerJoin(comparisons, eq(comparisons.id, findings.comparisonId))
    .innerJoin(captureSessions, eq(captureSessions.id, comparisons.returnSessionId))
    .where(and(notInArray(claims.state, [...UNDECIDED]), inArray(captureSessions.rentalItemId, rentalItemIds)))
    .groupBy(captureSessions.rentalItemId)
  // A rental of one item alone: every line of its decided claim is about that item, a person's written line too.
  const decidedClaims = rentalIds.length === 0 ? [] : await transaction
    .select({ rentalId: claims.rentalId, cents: sql<number>`coalesce(sum(${claimLines.amountCents}), 0)::bigint`.mapWith(Number) })
    .from(claimLines)
    .innerJoin(claims, eq(claims.id, claimLines.claimId))
    .where(and(notInArray(claims.state, [...UNDECIDED]), inArray(claims.rentalId, rentalIds)))
    .groupBy(claims.rentalId)
  // What PayPal collected on each rental: captured from the hold and paid by invoice, less what was refunded.
  const collected = rentalIds.length === 0 ? [] : await transaction
    .select({
      rentalId: moneyEvents.rentalId,
      cents: sql<number>`coalesce(sum(case when ${inArray(moneyEvents.kind, [...REFUND_KINDS])} then -${moneyEvents.amountCents} else ${moneyEvents.amountCents} end), 0)::bigint`.mapWith(Number),
    })
    .from(moneyEvents)
    .where(and(inArray(moneyEvents.kind, ['hold_captured', 'invoice_paid', ...REFUND_KINDS]), inArray(moneyEvents.rentalId, rentalIds)))
    .groupBy(moneyEvents.rentalId)
  const open = await transaction.select({ itemId: marks.itemId, count: count(marks.id) }).from(marks).where(eq(marks.status, 'open')).groupBy(marks.itemId)

  const repaired = new Map((await repairCosts(transaction)).byItem.map((row) => [row.itemId, { done: row.done, doneCostCents: row.costCents, open: row.open }]))

  const damageOf = new Map(found.map((row) => [row.rentalItemId, row.damage]))
  const pricedOf = new Map(priced.map((row) => [row.rentalItemId, row.cents]))
  const collectedOf = new Map(collected.map((row) => [row.rentalId, row.cents]))
  const openOf = new Map(open.map((row) => [row.itemId, row.count]))
  const wholeClaimOf = new Map(decidedClaims.map((row) => [row.rentalId, row.cents]))
  const itemsIn = new Map<string, number>()
  for (const row of rented) itemsIn.set(row.rentalId, (itemsIn.get(row.rentalId) ?? 0) + 1)
  // Lines priced from a finding on the item, or, for an item rented alone, every line of the claim.
  const linesFor = (row: (typeof rented)[number]) => (itemsIn.get(row.rentalId) === 1 ? (wholeClaimOf.get(row.rentalId) ?? 0) : (pricedOf.get(row.rentalItemId) ?? 0))
  return shopItems.map((item) => ({
    itemId: item.id,
    rentals: rented
      .filter((row) => row.itemId === item.id)
      .map((row) => ({
        rentalId: row.rentalId,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        damageFindings: damageOf.get(row.rentalItemId) ?? 0,
        claimLinesCents: linesFor(row),
        claimTotalCents: row.claimState === null || UNDECIDED.includes(row.claimState) ? null : row.claimTotalCents,
        collectedCents: collectedOf.get(row.rentalId) ?? 0,
      })),
    openMarks: openOf.get(item.id) ?? 0,
    repairs: repaired.get(item.id) ?? { done: 0, doneCostCents: 0, open: 0 },
  }))
}
