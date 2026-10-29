import { DROP_POINT_VIEW, maySelfReturn, RENTAL_TRANSITIONS, returnedOnTime, transition } from '@hold/domain'
import type { Region, RentalState, SelfReturnSettings } from '@hold/domain'
import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import { captureSession, sealSession, startCaptureSession } from './capture-repository.ts'
import type { SessionPhoto } from './capture-repository.ts'
import type { PhotoPlanView } from './schema/catalog.ts'
import { captureSessions, comparisons, findings, holds, items, photoPlans, photos, rentalItems, rentals, renters, shops, users } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// A return with nobody at the counter (architecture.md section 6.13). The renter photographs each item through their
// link and leaves it at the shop's drop point; the comparison runs overnight; a person who sees the item makes the
// rental returned, and only then can a clean release or a claim follow. Nothing here moves money.

type Refused<Reason extends string> = { readonly ok: false; readonly reason: Reason }

export async function selfReturnSettings(transaction: Transaction): Promise<SelfReturnSettings> {
  const [shop] = await transaction.select({ allowed: shops.selfReturn, dropPoint: shops.dropPoint, opens: shops.opensAt, closes: shops.closesAt }).from(shops).limit(1)
  if (shop === undefined) throw new Error('No shop in scope.')
  return { allowed: shop.allowed, dropPoint: shop.dropPoint, hours: shop.opens === null || shop.closes === null ? null : { opens: shop.opens, closes: shop.closes } }
}

// The settings, already checked by checkSelfReturnSettings.
export async function saveSelfReturnSettings(transaction: Transaction, shopId: string, settings: SelfReturnSettings): Promise<void> {
  await transaction.update(shops).set({ selfReturn: settings.allowed, dropPoint: settings.dropPoint, opensAt: settings.hours?.opens ?? null, closesAt: settings.hours?.closes ?? null }).where(eq(shops.id, shopId))
}

async function rentalLines(transaction: Transaction, rentalId: string) {
  return transaction.select({ id: rentalItems.id }).from(rentalItems).where(eq(rentalItems.rentalId, rentalId)).orderBy(asc(rentalItems.id))
}

async function handedOver(transaction: Transaction, rentalItemIds: readonly string[]): Promise<boolean> {
  if (rentalItemIds.length === 0) return false
  const sealed = await transaction.select({ id: captureSessions.rentalItemId }).from(captureSessions)
    .where(and(inArray(captureSessions.rentalItemId, [...rentalItemIds]), eq(captureSessions.kind, 'handover'), isNotNull(captureSessions.sealedAt)))
  return new Set(sealed.map((row) => row.id)).size === rentalItemIds.length
}

export type SelfReturnStart = { readonly ok: true; readonly sessionIds: readonly string[] } | Refused<'not_found' | 'not_allowed' | 'not_ready' | 'staff_returning'>

// Starts the renter's return of every item of the rental, or gives the ones already started.
export async function startSelfReturn(transaction: Transaction, rentalId: string, now: Date): Promise<SelfReturnStart> {
  const [rental] = await transaction.select({ state: rentals.state }).from(rentals).where(eq(rentals.id, rentalId))
  if (rental === undefined) return { ok: false, reason: 'not_found' }
  if (!(await selfReturnSettings(transaction)).allowed) return { ok: false, reason: 'not_allowed' }
  const lines = await rentalLines(transaction, rentalId)
  const open = maySelfReturn({ allowed: true, rentalState: rental.state, handedOver: await handedOver(transaction, lines.map((line) => line.id)) })
  if (!open && rental.state !== 'dropped_off') return { ok: false, reason: 'not_ready' }
  const sessionIds: string[] = []
  for (const line of lines) {
    const started = await startCaptureSession(transaction, { rentalId, rentalItemId: line.id, kind: 'return', actorUserId: null, byRenter: true }, now)
    if (!started.ok) return started
    sessionIds.push(started.sessionId)
  }
  return { ok: true, sessionIds }
}

// A photograph that repeats this item's evidence byte for byte, from any earlier session or another view of this one,
// proves nothing about the return. The renter is asked for another while still at the drop point; the comparison
// checks again overnight, to the eye as well (architecture.md section 10.2).
export async function photoRepeatsEvidence(transaction: Transaction, sessionId: string, sha256: string): Promise<boolean> {
  const [session] = await transaction.select({ itemId: rentalItems.itemId }).from(captureSessions).innerJoin(rentalItems, eq(rentalItems.id, captureSessions.rentalItemId)).where(eq(captureSessions.id, sessionId))
  if (session === undefined) return false
  const [repeated] = await transaction.select({ id: photos.id }).from(photos).innerJoin(captureSessions, eq(captureSessions.id, photos.sessionId)).innerJoin(rentalItems, eq(rentalItems.id, captureSessions.rentalItemId))
    .where(and(eq(rentalItems.itemId, session.itemId), eq(photos.sha256, sha256))).limit(1)
  return repeated !== undefined
}

async function renterSessions(transaction: Transaction, rentalId: string) {
  return transaction.select({ id: captureSessions.id }).from(captureSessions).innerJoin(rentalItems, eq(rentalItems.id, captureSessions.rentalItemId))
    .where(and(eq(rentalItems.rentalId, rentalId), eq(captureSessions.kind, 'return'), eq(captureSessions.byRenter, true))).orderBy(asc(rentalItems.id))
}

// Seals every item's return at once, so the rental is dropped off from this moment. Sending again changes nothing.
export async function sendSelfReturn(transaction: Transaction, rentalId: string, now: Date): Promise<{ readonly ok: true } | Refused<'not_found' | 'views_missing'>> {
  const sessions = await renterSessions(transaction, rentalId)
  if (sessions.length === 0 || sessions.length !== (await rentalLines(transaction, rentalId)).length) return { ok: false, reason: 'not_found' }
  for (const session of sessions) {
    const loaded = await captureSession(transaction, session.id)
    if (loaded === undefined || (loaded.sealedAt === null && loaded.missing.length > 0)) return { ok: false, reason: 'views_missing' }
  }
  for (const session of sessions) {
    const sealed = await sealSession(transaction, session.id, now)
    if (!sealed.ok) throw new Error('A checked return did not seal.')
  }
  return { ok: true }
}

export type SelfReturnItem = { readonly sessionId: string; readonly itemLabel: string; readonly plan: readonly PhotoPlanView[]; readonly photos: readonly SessionPhoto[]; readonly missing: readonly string[]; readonly sealed: boolean }

export type SelfReturnView = {
  readonly settings: SelfReturnSettings
  readonly timeZone: string
  readonly state: RentalState
  readonly endsAt: Date
  // Every item handed over with sealed photographs, so a return can be compared.
  readonly handedOver: boolean
  readonly droppedOffAt: Date | null
  readonly missingAt: Date | null
  readonly items: readonly SelfReturnItem[]
}

// What the renter's return page reads: the shop's words and hours, and each item's photographs so far.
export async function selfReturnFor(transaction: Transaction, rentalId: string): Promise<SelfReturnView | undefined> {
  const [rental] = await transaction.select({ state: rentals.state, endsAt: rentals.endsAt, droppedOffAt: rentals.droppedOffAt, missingAt: rentals.dropOffMissingAt, timeZone: shops.timeZone })
    .from(rentals).innerJoin(shops, eq(shops.id, rentals.shopId)).where(eq(rentals.id, rentalId))
  if (rental === undefined) return undefined
  const sessionItems: SelfReturnItem[] = []
  for (const session of await renterSessions(transaction, rentalId)) {
    const loaded = await captureSession(transaction, session.id)
    if (loaded !== undefined) sessionItems.push({ sessionId: loaded.id, itemLabel: loaded.itemLabel, plan: loaded.plan, photos: loaded.photos, missing: loaded.missing, sealed: loaded.sealedAt !== null })
  }
  const lines = await rentalLines(transaction, rentalId)
  return { settings: await selfReturnSettings(transaction), timeZone: rental.timeZone, state: rental.state, endsAt: rental.endsAt, handedOver: await handedOver(transaction, lines.map((line) => line.id)), droppedOffAt: rental.droppedOffAt, missingAt: rental.missingAt, items: sessionItems }
}

// A person saw the item at the drop point. The rental is returned, and the ordinary review follows: a clean release or
// a claim a person drafts and approves.
export async function confirmDropOff(transaction: Transaction, rentalId: string): Promise<{ readonly ok: true } | Refused<'not_found' | 'not_dropped_off'>> {
  const [rental] = await transaction.select({ state: rentals.state }).from(rentals).where(eq(rentals.id, rentalId)).for('update')
  if (rental === undefined) return { ok: false, reason: 'not_found' }
  if (rental.state !== 'dropped_off' || !transition(RENTAL_TRANSITIONS, rental.state, 'returned').ok) return { ok: false, reason: 'not_dropped_off' }
  await transaction.update(rentals).set({ state: 'returned' }).where(eq(rentals.id, rentalId))
  return { ok: true }
}

// The item was not where the renter said, written once with who looked and when. The hold stays and nothing is charged;
// the rental stays dropped off, so a person can still confirm the item when it turns up.
export async function reportDropOffMissing(transaction: Transaction, rentalId: string, userId: string, now: Date): Promise<{ readonly ok: true } | Refused<'not_found' | 'not_dropped_off' | 'already_reported'>> {
  const [rental] = await transaction.select({ state: rentals.state, missingAt: rentals.dropOffMissingAt }).from(rentals).where(eq(rentals.id, rentalId)).for('update')
  if (rental === undefined) return { ok: false, reason: 'not_found' }
  if (rental.state !== 'dropped_off') return { ok: false, reason: 'not_dropped_off' }
  if (rental.missingAt !== null) return { ok: false, reason: 'already_reported' }
  await transaction.update(rentals).set({ dropOffMissingAt: now, dropOffMissingByUserId: userId }).where(eq(rentals.id, rentalId))
  return { ok: true }
}

export type DropOffNotice = { readonly email: string | null; readonly language: string; readonly timeZone: string; readonly endsAt: Date; readonly droppedOffAt: Date | null; readonly simulated: boolean }

// Whom to tell that the item was not at the drop point: the payer PayPal named, or else the contact staff booked for,
// in the rental's language.
export async function dropOffNotice(transaction: Transaction, rentalId: string): Promise<DropOffNotice | undefined> {
  const [row] = await transaction
    .select({ payerEmail: renters.email, contactEmail: rentals.contactEmail, language: rentals.language, timeZone: shops.timeZone, endsAt: rentals.endsAt, droppedOffAt: rentals.droppedOffAt, simulated: rentals.simulated })
    .from(rentals).innerJoin(shops, eq(shops.id, rentals.shopId)).leftJoin(renters, eq(renters.id, rentals.renterId)).where(eq(rentals.id, rentalId))
  if (row === undefined) return undefined
  const { payerEmail, contactEmail, ...rest } = row
  return { ...rest, email: payerEmail ?? contactEmail }
}

// Findings a person must look at: new damage, a missing part, or what the comparison could not tell.
const NOTABLE = ['new_damage', 'missing_part', 'uncertain'] as const

type DropOffPhoto = { readonly view: string; readonly displayKey: string | null }

export type WaitingDropOff = {
  readonly rentalId: string
  readonly renterName: string | null
  readonly droppedOffAt: Date
  readonly onTime: boolean
  readonly missingAt: Date | null
  readonly missingBy: string | null
  readonly holdCents: number | null
  readonly currency: string
  readonly simulated: boolean
  readonly items: readonly {
    readonly label: string
    // The views compared with the handover, not counting where the item was left.
    readonly views: number
    readonly findings: number
    readonly comparison: string | null
    readonly comparisonId: string | null
    readonly dropPoint: DropOffPhoto | null
    // The view a person should look at first: one with a finding, or else the first, and its name in the plan.
    readonly viewLabel: string | null
    readonly before: DropOffPhoto | null
    readonly after: DropOffPhoto | null
    readonly region: Region | null
  }[]
}

// Every item renters dropped off that nobody has checked yet, oldest first: the morning's first job.
export async function dropOffsWaiting(transaction: Transaction): Promise<readonly WaitingDropOff[]> {
  const rows = await transaction
    .select({ rentalId: rentals.id, renterName: renters.name, droppedOffAt: rentals.droppedOffAt, endsAt: rentals.endsAt, missingAt: rentals.dropOffMissingAt, missingBy: users.name, holdCents: holds.reservedCents, currency: rentals.currency, simulated: rentals.simulated })
    .from(rentals).leftJoin(renters, eq(renters.id, rentals.renterId)).leftJoin(holds, eq(holds.rentalId, rentals.id)).leftJoin(users, eq(users.id, rentals.dropOffMissingByUserId))
    .where(and(eq(rentals.state, 'dropped_off'), isNotNull(rentals.droppedOffAt))).orderBy(asc(rentals.droppedOffAt))
  const waiting: WaitingDropOff[] = []
  for (const row of rows) {
    if (row.droppedOffAt === null) continue
    const lines = await transaction.select({ rentalItemId: rentalItems.id, label: items.label }).from(rentalItems).innerJoin(items, eq(items.id, rentalItems.itemId)).where(eq(rentalItems.rentalId, row.rentalId)).orderBy(asc(rentalItems.id))
    const itemsOf = []
    for (const line of lines) itemsOf.push({ label: line.label, ...(await droppedItem(transaction, line.rentalItemId)) })
    waiting.push({ rentalId: row.rentalId, renterName: row.renterName, droppedOffAt: row.droppedOffAt, onTime: returnedOnTime(row.droppedOffAt, row.endsAt), missingAt: row.missingAt, missingBy: row.missingBy, holdCents: row.holdCents, currency: row.currency, simulated: row.simulated, items: itemsOf })
  }
  return waiting
}

async function sessionPhotos(transaction: Transaction, sessionId: string): Promise<readonly DropOffPhoto[]> {
  return transaction.select({ view: photos.view, displayKey: photos.displayKey }).from(photos).where(and(eq(photos.sessionId, sessionId), isNull(photos.supersededAt))).orderBy(asc(photos.view))
}

async function droppedItem(transaction: Transaction, rentalItemId: string) {
  const sessions = await transaction.select({ id: captureSessions.id, kind: captureSessions.kind, plan: photoPlans.views }).from(captureSessions).innerJoin(photoPlans, eq(photoPlans.id, captureSessions.photoPlanId))
    .where(and(eq(captureSessions.rentalItemId, rentalItemId), inArray(captureSessions.kind, ['handover', 'return']), isNotNull(captureSessions.sealedAt)))
  const handover = sessions.find((session) => session.kind === 'handover')
  const returned = sessions.find((session) => session.kind === 'return')
  const after = returned === undefined ? [] : await sessionPhotos(transaction, returned.id)
  const before = handover === undefined ? [] : await sessionPhotos(transaction, handover.id)
  const [comparison] = returned === undefined ? [] : await transaction.select({ id: comparisons.id, state: comparisons.state }).from(comparisons).where(eq(comparisons.returnSessionId, returned.id))
  const found = comparison === undefined ? [] : await transaction.select({ view: findings.view, region: findings.region }).from(findings)
    .where(and(eq(findings.comparisonId, comparison.id), inArray(findings.class, [...NOTABLE]))).orderBy(asc(findings.view), asc(findings.id))
  const compared = after.filter((photo) => photo.view !== DROP_POINT_VIEW)
  const first = found[0]
  const shown = first?.view ?? compared[0]?.view
  return {
    views: compared.length,
    findings: found.length,
    comparison: comparison?.state ?? null,
    comparisonId: comparison?.id ?? null,
    dropPoint: after.find((photo) => photo.view === DROP_POINT_VIEW) ?? null,
    viewLabel: handover?.plan.find((view) => view.key === shown)?.label ?? null,
    before: before.find((photo) => photo.view === shown) ?? null,
    after: compared.find((photo) => photo.view === shown) ?? null,
    region: first?.region ?? null,
  }
}
