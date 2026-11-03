import { checkRepairClose, REPAIR_TRANSITIONS, repairViews, transition } from '@hold/domain'
import type { Region, RepairOutcome, RentalState } from '@hold/domain'
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { sealSession } from './capture-repository.ts'
import { claimStaff } from './claim-access.ts'
import { changeStatus } from './item-repository.ts'
import { auditLog, captureSessions, claimLines, claims, comparisons, findings, incidents, items, itemTypes, marks, photos, priceEntries, rentalItems, rentals, renters, repairLines, repairs, users } from './schema/index.ts'
import type { Transaction } from './scope.ts'
import { rentalName } from './rental-name.ts'

// Repair closes the loop (architecture.md section 9.6). A charge confirmed by PayPal puts the damage it was for on the
// item's passport as known marks and opens a repair for each item; staff may also open one from an item's open marks.
// Staff photograph the marked views, say what was done to each line and what it cost, and the repaired marks close
// with those photographs as their evidence. Nothing here moves money.

type Refused<Reason extends string> = { readonly ok: false; readonly reason: Reason }
const refused = <Reason extends string>(reason: Reason): Refused<Reason> => ({ ok: false, reason })
// An item a renter has, that waits at the drop point, or whose return is still being compared is not repaired or
// closed: a mark closed then would no longer be set aside for the rental it was handed over with.
const IN_USE: readonly RentalState[] = ['out', 'overdue', 'dropped_off', 'returned', 'inspecting']
// A repair opened by hand is filed under a rental that has ended, never a booking still to come or one under way.
const ENDED: readonly RentalState[] = ['settling', 'closed']

async function inUse(transaction: Transaction, itemId: string): Promise<boolean> {
  const using = await transaction.select({ id: rentals.id }).from(rentalItems).innerJoin(rentals, eq(rentals.id, rentalItems.rentalId)).where(and(eq(rentalItems.itemId, itemId), inArray(rentals.state, [...IN_USE]))).limit(1)
  return using.length > 0
}

type ItemLines = { rentalItemId: string; lines: { markId: string | null; claimLineId: string; description: string; claimedCents: number }[] }

// Run in the transaction that records the confirmed capture. Each line is put with the item it is about: a finding's
// item through its return session, an agreed incident's through its report, and a person's written line only when
// the rental had one item. A finding becomes an open mark first seen in that return session. Runs once per claim.
export async function openRepairsForClaim(transaction: Transaction, claimId: string, now: Date): Promise<string[]> {
  const [claim] = await transaction.select({ id: claims.id, shopId: claims.shopId, rentalId: claims.rentalId, currency: claims.currency }).from(claims).where(eq(claims.id, claimId)).for('update')
  if (claim === undefined || (await transaction.select({ id: repairs.id }).from(repairs).where(eq(repairs.claimId, claimId))).length > 0) return []
  const lines = await transaction
    .select({ id: claimLines.id, amountCents: claimLines.amountCents, priceDescription: priceEntries.description, reason: claimLines.reason, findingId: claimLines.findingId, incidentId: claimLines.incidentId })
    .from(claimLines).innerJoin(priceEntries, eq(priceEntries.id, claimLines.priceEntryId)).where(eq(claimLines.claimId, claimId)).orderBy(asc(claimLines.createdAt), asc(claimLines.id))
  const rentalItemsOf = await transaction.select({ id: rentalItems.id, itemId: rentalItems.itemId }).from(rentalItems).where(eq(rentalItems.rentalId, claim.rentalId))
  const byItem = new Map<string, ItemLines>()
  const add = (itemId: string, rentalItemId: string, line: ItemLines['lines'][number]) => {
    const entry = byItem.get(itemId) ?? { rentalItemId, lines: [] }
    entry.lines.push(line)
    byItem.set(itemId, entry)
  }
  for (const line of lines) {
    const base = { claimLineId: line.id, description: line.priceDescription, claimedCents: line.amountCents }
    if (line.findingId !== null) {
      const [found] = await transaction
        .select({ view: findings.view, region: findings.region, description: findings.description, sessionId: captureSessions.id, rentalItemId: captureSessions.rentalItemId, itemId: rentalItems.itemId })
        .from(findings).innerJoin(comparisons, eq(comparisons.id, findings.comparisonId)).innerJoin(captureSessions, eq(captureSessions.id, comparisons.returnSessionId)).innerJoin(rentalItems, eq(rentalItems.id, captureSessions.rentalItemId))
        .where(eq(findings.id, line.findingId))
      if (found === undefined) continue
      const [mark] = await transaction.insert(marks).values({ shopId: claim.shopId, itemId: found.itemId, view: found.view, region: found.region, description: found.description, firstSeenSessionId: found.sessionId }).returning({ id: marks.id })
      add(found.itemId, found.rentalItemId, { ...base, markId: mark?.id ?? null })
    } else if (line.incidentId !== null) {
      const [reported] = await transaction.select({ rentalItemId: incidents.rentalItemId, itemId: rentalItems.itemId, markId: marks.id }).from(incidents).innerJoin(rentalItems, eq(rentalItems.id, incidents.rentalItemId)).leftJoin(marks, eq(marks.incidentId, incidents.id)).where(eq(incidents.id, line.incidentId))
      if (reported !== undefined) add(reported.itemId, reported.rentalItemId, { ...base, markId: reported.markId })
    } else if (rentalItemsOf.length === 1 && rentalItemsOf[0] !== undefined) {
      add(rentalItemsOf[0].itemId, rentalItemsOf[0].id, { ...base, description: line.reason ?? line.priceDescription, markId: null })
    }
  }
  const opened: string[] = []
  for (const [itemId, entry] of byItem) {
    const [repair] = await transaction.insert(repairs).values({ shopId: claim.shopId, itemId, claimId, rentalItemId: entry.rentalItemId, currency: claim.currency, createdAt: now }).returning({ id: repairs.id })
    if (repair === undefined) throw new Error('The repair was not opened.')
    // Lines with a mark to photograph come first.
    const ordered = [...entry.lines].sort((first, second) => Number(first.markId === null) - Number(second.markId === null))
    await transaction.insert(repairLines).values(ordered.map((line, position) => ({ shopId: claim.shopId, repairId: repair.id, ...line, position, createdAt: now })))
    await transaction.insert(auditLog).values({ shopId: claim.shopId, actorKind: 'system', action: 'repair.opened', subjectKind: 'repair', subjectId: repair.id, detail: { claimId, itemId }, at: now })
    opened.push(repair.id)
  }
  return opened
}

async function staffFor(transaction: Transaction, userId: string, itemId: string) {
  const [item] = await transaction.select({ currency: itemTypes.currency }).from(items).innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId)).where(eq(items.id, itemId))
  if (item === undefined) return refused('not_found')
  const allowed = await claimStaff(transaction, userId, item.currency)
  return allowed.ok ? { ok: true, currency: item.currency } as const : allowed
}

// Staff open a repair for open marks of one item that no open repair covers yet, on the item's latest rental.
export async function openRepairFromMarks(transaction: Transaction, input: { readonly itemId: string; readonly markIds: readonly string[]; readonly userId: string }, now: Date) {
  const staff = await staffFor(transaction, input.userId, input.itemId)
  if (!staff.ok) return staff
  if (input.markIds.length === 0) return refused('marks_needed')
  const chosen = await transaction.select({ id: marks.id, shopId: marks.shopId, description: marks.description }).from(marks).where(and(inArray(marks.id, [...input.markIds]), eq(marks.itemId, input.itemId), eq(marks.status, 'open')))
  if (chosen.length !== new Set(input.markIds).size) return refused('not_found')
  const covered = await transaction.select({ id: repairLines.id }).from(repairLines).innerJoin(repairs, eq(repairs.id, repairLines.repairId)).where(and(eq(repairs.state, 'open'), inArray(repairLines.markId, [...input.markIds])))
  if (covered.length > 0) return refused('mark_in_repair')
  if (await inUse(transaction, input.itemId)) return refused('item_in_use')
  const [latest] = await transaction.select({ id: rentalItems.id }).from(rentalItems).innerJoin(rentals, eq(rentals.id, rentalItems.rentalId)).where(and(eq(rentalItems.itemId, input.itemId), inArray(rentals.state, [...ENDED]))).orderBy(desc(rentals.endsAt)).limit(1)
  const shopId = chosen[0]?.shopId
  if (latest === undefined || shopId === undefined) return refused('not_found')
  const [repair] = await transaction.insert(repairs).values({ shopId, itemId: input.itemId, rentalItemId: latest.id, currency: staff.currency, openedByUserId: input.userId, createdAt: now }).returning({ id: repairs.id })
  if (repair === undefined) throw new Error('The repair was not opened.')
  await transaction.insert(repairLines).values(chosen.map((mark, position) => ({ shopId, repairId: repair.id, markId: mark.id, description: mark.description, position, createdAt: now })))
  await transaction.insert(auditLog).values({ shopId, actorKind: 'person', actorId: input.userId, action: 'repair.opened', subjectKind: 'repair', subjectId: repair.id, detail: { itemId: input.itemId }, at: now })
  return { ok: true, repairId: repair.id } as const
}

async function linesOf(transaction: Transaction, repairIds: readonly string[]) {
  if (repairIds.length === 0) return []
  return transaction
    .select({ id: repairLines.id, repairId: repairLines.repairId, markId: repairLines.markId, view: marks.view, region: sql<Region | null>`${marks.region}`, firstSeenSessionId: marks.firstSeenSessionId, claimLineId: repairLines.claimLineId, description: repairLines.description, claimedCents: repairLines.claimedCents, outcome: sql<RepairOutcome | null>`${repairLines.outcome}` })
    .from(repairLines).leftJoin(marks, eq(marks.id, repairLines.markId)).where(inArray(repairLines.repairId, [...repairIds])).orderBy(asc(repairLines.repairId), asc(repairLines.position))
}

// The views a repair session photographs: those its marks are on (capture-repository's sessionRow reads this).
export async function repairSessionViews(transaction: Transaction, sessionId: string): Promise<string[]> {
  const [repair] = await transaction.select({ id: repairs.id }).from(repairs).where(eq(repairs.sessionId, sessionId))
  return repair === undefined ? [] : repairViews(await linesOf(transaction, [repair.id]))
}

// The session the repair's photographs go in, on its rental item, asking only for the marked views. None when no line
// has a mark. Refused while a renter has the item.
export async function startRepairCapture(transaction: Transaction, repairId: string, userId: string, now: Date) {
  const [repair] = await transaction.select().from(repairs).where(eq(repairs.id, repairId)).for('update')
  if (repair === undefined) return refused('not_found')
  const staff = await staffFor(transaction, userId, repair.itemId)
  if (!staff.ok) return staff
  if (repair.state !== 'open') return refused('already_done')
  if (await inUse(transaction, repair.itemId)) return refused('item_in_use')
  if (repair.sessionId !== null) return { ok: true, sessionId: repair.sessionId } as const
  if (repairViews(await linesOf(transaction, [repairId])).length === 0) return { ok: true, sessionId: null } as const
  const [plan] = await transaction.select({ planId: itemTypes.photoPlanId }).from(items).innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId)).where(eq(items.id, repair.itemId))
  if (plan === undefined) return refused('not_found')
  const [session] = await transaction.insert(captureSessions).values({ shopId: repair.shopId, rentalItemId: repair.rentalItemId, kind: 'repair', photoPlanId: plan.planId, actorUserId: userId, startedAt: now }).returning({ id: captureSessions.id })
  if (session === undefined) throw new Error('The repair session was not started.')
  await transaction.update(repairs).set({ sessionId: session.id }).where(eq(repairs.id, repairId))
  return { ok: true, sessionId: session.id } as const
}

type CloseInput = { readonly repairId: string; readonly userId: string; readonly outcomes: Readonly<Record<string, RepairOutcome>>; readonly costCents: number; readonly note: string }

// Seals the photographs into the item's chain, writes each line's outcome, closes the repaired marks with the repair
// as their evidence, records the cost, and returns the item to service when no other repair keeps it out.
export async function closeRepair(transaction: Transaction, input: CloseInput, now: Date) {
  const [repair] = await transaction.select().from(repairs).where(eq(repairs.id, input.repairId)).for('update')
  if (repair === undefined) return refused('not_found')
  const staff = await staffFor(transaction, input.userId, repair.itemId)
  if (!staff.ok) return staff
  if (!transition(REPAIR_TRANSITIONS, repair.state === 'done' ? 'done' : 'open', 'done').ok) return refused('already_done')
  if (await inUse(transaction, repair.itemId)) return refused('item_in_use')
  const lines = await linesOf(transaction, [repair.id])
  if (repairViews(lines).length > 0) {
    if (repair.sessionId === null) return refused('views_missing')
    const sealed = await sealSession(transaction, repair.sessionId, now)
    if (!sealed.ok) return refused(sealed.reason)
  }
  const checked = checkRepairClose({ lines, outcomes: input.outcomes, costCents: input.costCents, note: input.note })
  if (!checked.ok) return refused(checked.error)
  for (const line of lines) await transaction.update(repairLines).set({ outcome: checked.value.outcomes[line.id] }).where(eq(repairLines.id, line.id))
  const repaired = lines.flatMap((line) => (line.markId !== null && checked.value.outcomes[line.id] === 'repaired' ? [line.markId] : []))
  if (repaired.length > 0) await transaction.update(marks).set({ status: 'repaired', closedAt: now, repairId: repair.id }).where(and(inArray(marks.id, repaired), inArray(marks.status, ['open', 'reported'])))
  await transaction.update(repairs).set({ state: 'done', costCents: checked.value.costCents, note: checked.value.note, closedByUserId: input.userId, closedAt: now }).where(eq(repairs.id, repair.id))
  const [item] = await transaction.select({ status: items.status }).from(items).where(eq(items.id, repair.itemId))
  const stillOpen = await transaction.select({ id: repairs.id }).from(repairs).where(and(eq(repairs.itemId, repair.itemId), eq(repairs.state, 'open')))
  if (item?.status === 'in_repair' && stillOpen.length === 0) await changeStatus(transaction, repair.itemId, { to: 'in_service', note: '' }, now)
  await transaction.insert(auditLog).values({ shopId: repair.shopId, actorKind: 'person', actorId: input.userId, action: 'repair.closed', subjectKind: 'repair', subjectId: repair.id, detail: { costCents: checked.value.costCents, repaired: repaired.length }, at: now })
  return { ok: true, repairId: repair.id, itemId: repair.itemId } as const
}

const opener = alias(users, 'opener')
const closer = alias(users, 'closer')

// An item's repairs, newest first, each with its lines and whether its photographs are sealed.
export async function itemRepairs(transaction: Transaction, itemId: string) {
  const rows = await transaction
    .select({ id: repairs.id, state: repairs.state, claimId: repairs.claimId, currency: repairs.currency, costCents: repairs.costCents, note: repairs.note, createdAt: repairs.createdAt, closedAt: repairs.closedAt, sessionId: repairs.sessionId, sessionSealed: sql<boolean>`${captureSessions.sealedAt} is not null`, opener: opener.name, closer: closer.name, renterName: rentalName })
    .from(repairs).leftJoin(captureSessions, eq(captureSessions.id, repairs.sessionId)).leftJoin(claims, eq(claims.id, repairs.claimId)).leftJoin(rentals, eq(rentals.id, claims.rentalId)).leftJoin(renters, eq(renters.id, rentals.renterId)).leftJoin(opener, eq(opener.id, repairs.openedByUserId)).leftJoin(closer, eq(closer.id, repairs.closedByUserId))
    .where(eq(repairs.itemId, itemId)).orderBy(desc(repairs.createdAt), desc(repairs.id))
  const lines = await linesOf(transaction, rows.map((row) => row.id))
  return rows.map((row) => ({ ...row, lines: lines.filter((line) => line.repairId === row.id) }))
}

export type ItemRepair = Awaited<ReturnType<typeof itemRepairs>>[number]

// Every open repair, oldest first: the decision board's rows.
export async function openRepairs(transaction: Transaction) {
  return transaction
    .select({ id: repairs.id, itemId: repairs.itemId, itemLabel: items.label, claimId: repairs.claimId, currency: repairs.currency, createdAt: repairs.createdAt, renterName: rentalName, claimedCents: sql<number>`coalesce((select sum(${repairLines.claimedCents}) from ${repairLines} where ${repairLines.repairId} = ${repairs.id}), 0)::bigint`.mapWith(Number), simulated: items.simulated })
    .from(repairs).innerJoin(items, eq(items.id, repairs.itemId)).leftJoin(claims, eq(claims.id, repairs.claimId)).leftJoin(rentals, eq(rentals.id, claims.rentalId)).leftJoin(renters, eq(renters.id, rentals.renterId))
    .where(eq(repairs.state, 'open')).orderBy(asc(repairs.createdAt), asc(repairs.id))
}

export type OpenRepair = Awaited<ReturnType<typeof openRepairs>>[number]

// What repairs cost: by item, all done repairs and how many are open; by price, the repairs whose every line was priced
// from that one entry, so a cost is set against a price only when it is the cost of that damage alone.
export async function repairCosts(transaction: Transaction) {
  const byItem = await transaction
    .select({ itemId: repairs.itemId, costCents: sql<number>`coalesce(sum(${repairs.costCents}) filter (where ${repairs.state} = 'done'), 0)::bigint`.mapWith(Number), done: sql<number>`count(*) filter (where ${repairs.state} = 'done')::int`, open: sql<number>`count(*) filter (where ${repairs.state} = 'open')::int` })
    .from(repairs).groupBy(repairs.itemId)
  const single = await transaction
    .select({ repairId: repairs.id, costCents: repairs.costCents, priceEntryId: sql<string>`min(${claimLines.priceEntryId}::text)`, entries: sql<number>`count(distinct ${claimLines.priceEntryId})::int`, unpriced: sql<number>`count(*) filter (where ${repairLines.claimLineId} is null)::int` })
    .from(repairs).innerJoin(repairLines, eq(repairLines.repairId, repairs.id)).leftJoin(claimLines, eq(claimLines.id, repairLines.claimLineId))
    .where(and(eq(repairs.state, 'done'), isNotNull(repairs.costCents))).groupBy(repairs.id, repairs.costCents)
  const priced = single.filter((row) => row.entries === 1 && row.unpriced === 0)
  const entries = priced.length === 0 ? [] : await transaction.select({ id: priceEntries.id, description: priceEntries.description, amountCents: priceEntries.amountCents }).from(priceEntries).where(inArray(priceEntries.id, [...new Set(priced.map((row) => row.priceEntryId))]))
  const byPrice = entries.map((entry) => ({ priceEntryId: entry.id, description: entry.description, priceCents: entry.amountCents, costsCents: priced.filter((row) => row.priceEntryId === entry.id).map((row) => row.costCents ?? 0) }))
  return { byItem, byPrice }
}

// For each marked line, the photograph the mark was found on, in its view, with the mark's region: what staff frame the
// repaired view against.
export async function repairGuides(transaction: Transaction, repairId: string) {
  const lines = (await linesOf(transaction, [repairId])).filter((line) => line.markId !== null && line.firstSeenSessionId !== null && line.view !== null)
  if (lines.length === 0) return []
  const shots = await transaction.select({ sessionId: photos.sessionId, view: photos.view, displayKey: photos.displayKey }).from(photos).where(and(inArray(photos.sessionId, lines.map((line) => line.firstSeenSessionId ?? '')), isNull(photos.supersededAt)))
  return lines.map((line) => ({ markId: line.markId ?? '', view: line.view ?? '', region: line.region, description: line.description, displayKey: shots.find((shot) => shot.sessionId === line.firstSeenSessionId && shot.view === line.view)?.displayKey ?? null }))
}

// What became of each line of a rental's claim, once its repair was closed: the renter who paid sees it repaired or
// left, when, and the photograph of the repaired view.
export async function claimRepairs(transaction: Transaction, rentalId: string) {
  const rows = await transaction
    .select({ claimLineId: repairLines.claimLineId, outcome: sql<RepairOutcome | null>`${repairLines.outcome}`, repairedAt: repairs.closedAt, sessionId: repairs.sessionId, view: marks.view })
    .from(repairLines).innerJoin(repairs, eq(repairs.id, repairLines.repairId)).innerJoin(claims, eq(claims.id, repairs.claimId)).leftJoin(marks, eq(marks.id, repairLines.markId))
    .where(and(eq(claims.rentalId, rentalId), eq(repairs.state, 'done')))
  const sessions = rows.flatMap((row) => (row.sessionId === null ? [] : [row.sessionId]))
  const shots = sessions.length === 0 ? [] : await transaction.select({ sessionId: photos.sessionId, view: photos.view, displayKey: photos.displayKey }).from(photos).where(and(inArray(photos.sessionId, sessions), isNull(photos.supersededAt)))
  return rows.flatMap((row) => (row.claimLineId === null || row.outcome === null ? [] : [{ claimLineId: row.claimLineId, outcome: row.outcome, repairedAt: row.repairedAt, displayKey: shots.find((shot) => shot.sessionId === row.sessionId && shot.view === row.view)?.displayKey ?? null }]))
}
