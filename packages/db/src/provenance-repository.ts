import { photoTakenBy } from '@hold/domain'
import type { CaptureSessionKind, ConditionReply, PhotoSource, PhotoTaker } from '@hold/domain'
import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import { captureSessions, items, photoPlans, photos, rentalItems, rentals, shops, staffRoles } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// Where each evidence photograph came from, for the line under it and for the statement Hold signs about an item's
// evidence (architecture.md section 9.7). Read in the link's or the staff member's shop, so another shop's
// photographs are never found.

export type PhotoProvenance = {
  // The server's time, not the phone's.
  readonly takenAt: Date
  readonly takenBy: PhotoTaker
  readonly source: PhotoSource | null
  readonly sha256: string
  // Null while its session is still open.
  readonly sealedAt: Date | null
  readonly itemId: string
}

// By display copy, the address screens show a photograph through.
export async function photoProvenance(transaction: Transaction, displayKeys: readonly string[]): Promise<ReadonlyMap<string, PhotoProvenance>> {
  if (displayKeys.length === 0) return new Map()
  const rows = await transaction
    .select({ displayKey: photos.displayKey, takenAt: photos.receivedAt, source: photos.source, sha256: photos.sha256, kind: captureSessions.kind, byRenter: captureSessions.byRenter, actorRole: staffRoles.role, sealedAt: captureSessions.sealedAt, itemId: rentalItems.itemId })
    .from(photos)
    .innerJoin(captureSessions, eq(captureSessions.id, photos.sessionId))
    .innerJoin(rentalItems, eq(rentalItems.id, captureSessions.rentalItemId))
    .leftJoin(staffRoles, and(eq(staffRoles.userId, captureSessions.actorUserId), eq(staffRoles.shopId, captureSessions.shopId)))
    .where(inArray(photos.displayKey, [...displayKeys]))
  return new Map(rows.flatMap(({ displayKey, kind, byRenter, actorRole, ...row }) => (displayKey === null ? [] : [[displayKey, { ...row, takenBy: photoTakenBy({ kind, byRenter, actorRole }) }] as const])))
}

export type ConditionConfirmation = { readonly reply: ConditionReply; readonly at: Date }

// The renter's own answer to the handover photographs, and when they gave it. Null until they answer.
export async function conditionConfirmation(transaction: Transaction, rentalId: string): Promise<ConditionConfirmation | null> {
  const [row] = await transaction.select({ reply: rentals.conditionReply, at: rentals.conditionRepliedAt }).from(rentals).where(eq(rentals.id, rentalId))
  return row?.reply == null || row.at === null ? null : { reply: row.reply, at: row.at }
}

export type StatementSession = {
  readonly kind: CaptureSessionKind
  // The sealed manifest's exact text, whose SHA-256 is the fingerprint: a checker hashes it again.
  readonly manifest: string
  readonly fingerprint: string
  readonly takenBy: PhotoTaker
  readonly sources: Readonly<Record<string, PhotoSource | null>>
}

export type EvidenceStatementSource = {
  readonly shopName: string
  // The shop's clock, so every time in the statement reads as the renter saw it.
  readonly timeZone: string
  readonly itemLabel: string
  readonly simulated: boolean
  readonly confirmed: ConditionConfirmation | null
  // The plan's names for its views, as the shop wrote them.
  readonly views: Readonly<Record<string, string>>
  // In the order they were sealed, so each names the one before it in the item's chain.
  readonly sessions: readonly StatementSession[]
}

// Every sealed session of one item in one rental. Undefined when the item is not in the rental or nothing is sealed.
export async function evidenceStatementSource(transaction: Transaction, rentalId: string, itemId: string): Promise<EvidenceStatementSource | undefined> {
  const sessions = await transaction
    .select({ id: captureSessions.id, kind: captureSessions.kind, byRenter: captureSessions.byRenter, actorRole: staffRoles.role, manifest: captureSessions.manifest, fingerprint: captureSessions.manifestFingerprint, planViews: photoPlans.views, itemLabel: items.label, shopName: shops.name, timeZone: shops.timeZone, simulated: rentals.simulated })
    .from(captureSessions)
    .innerJoin(rentalItems, eq(rentalItems.id, captureSessions.rentalItemId))
    .innerJoin(rentals, eq(rentals.id, rentalItems.rentalId))
    .innerJoin(shops, eq(shops.id, rentals.shopId))
    .innerJoin(items, eq(items.id, rentalItems.itemId))
    .innerJoin(photoPlans, eq(photoPlans.id, captureSessions.photoPlanId))
    .leftJoin(staffRoles, and(eq(staffRoles.userId, captureSessions.actorUserId), eq(staffRoles.shopId, captureSessions.shopId)))
    .where(and(eq(rentalItems.rentalId, rentalId), eq(rentalItems.itemId, itemId), isNotNull(captureSessions.sealedAt)))
    .orderBy(asc(captureSessions.sealedAt))
  const [first] = sessions
  if (first === undefined) return undefined
  const sealed = sessions.flatMap((session) => (session.manifest === null || session.fingerprint === null ? [] : [{ ...session, manifest: session.manifest, fingerprint: session.fingerprint }]))
  const taken = await transaction
    .select({ sessionId: photos.sessionId, view: photos.view, source: photos.source })
    .from(photos)
    .where(and(inArray(photos.sessionId, sealed.map((session) => session.id)), isNull(photos.supersededAt)))
  return {
    shopName: first.shopName,
    timeZone: first.timeZone,
    itemLabel: first.itemLabel,
    simulated: first.simulated,
    confirmed: await conditionConfirmation(transaction, rentalId),
    views: Object.fromEntries(first.planViews.map((view) => [view.key, view.label])),
    sessions: sealed.map((session) => ({
      kind: session.kind,
      manifest: session.manifest,
      fingerprint: session.fingerprint,
      takenBy: photoTakenBy(session),
      sources: Object.fromEntries(taken.filter((photo) => photo.sessionId === session.id).map((photo) => [photo.view, photo.source])),
    })),
  }
}
