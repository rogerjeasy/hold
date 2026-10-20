import { createHash } from 'node:crypto'
import { checkRegion, conditionReplyOpen, CONDITION_REPLY_HOURS, manifestText, mayHandOver, MISSED_VIEWS, missingViews, RENTAL_TRANSITIONS, transition } from '@hold/domain'
import type { CaptureSessionKind, ConditionReply, PhotoMeasures, Region } from '@hold/domain'
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import type { PhotoPlanView } from './schema/catalog.ts'
import { captureSessions, holds, items, itemTypes, marks, outbox, photoPlans, photos, rentalItems, rentals } from './schema/index.ts'
import type { Transaction } from './scope.ts'
import { queueReturnComparisons } from './return-repository.ts'

// Capture sessions (architecture.md section 9): the guided photographs of one item, its marks, the sealed manifest
// that chains the item's sessions, and the renter's answer to the condition report. Built for the handover (section
// 11.2); a renter adds what staff missed in a `condition` session.

export const MEDIA_QUEUE = 'media'

const fingerprintOf = (text: string) => createHash('sha256').update(text).digest('hex')

type StartRequest = { readonly rentalId: string; readonly rentalItemId: string; readonly kind: CaptureSessionKind; readonly actorUserId: string | null }

export type StartResult = { readonly ok: true; readonly sessionId: string } | { readonly ok: false; readonly reason: 'not_found' | 'not_ready' }

// Starts a session for one item of a rental, or gives the one already started. A handover needs the rental ready,
// with its hold placed; a renter's condition session needs the item handed over and the reply still open.
export async function startCaptureSession(transaction: Transaction, request: StartRequest, now: Date): Promise<StartResult> {
  const [rental] = await transaction
    .select({ shopId: rentals.shopId, state: rentals.state, reply: rentals.conditionReply, holdState: holds.state, planId: itemTypes.photoPlanId })
    .from(rentalItems)
    .innerJoin(rentals, eq(rentals.id, rentalItems.rentalId))
    .innerJoin(items, eq(items.id, rentalItems.itemId))
    .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
    .leftJoin(holds, eq(holds.rentalId, rentals.id))
    .where(and(eq(rentalItems.id, request.rentalItemId), eq(rentalItems.rentalId, request.rentalId)))
    .for('update', { of: rentals })
  if (rental === undefined) return { ok: false, reason: 'not_found' }
  const sessionsOf = (kind: CaptureSessionKind) =>
    transaction.select({ id: captureSessions.id, sealedAt: captureSessions.sealedAt, planId: captureSessions.photoPlanId }).from(captureSessions).where(and(eq(captureSessions.rentalItemId, request.rentalItemId), eq(captureSessions.kind, kind))).orderBy(asc(captureSessions.startedAt))
  let planId = rental.planId
  if (request.kind === 'handover') {
    const [existing] = await sessionsOf('handover')
    if (existing !== undefined) return { ok: true, sessionId: existing.id }
    if (rental.state !== 'ready' || rental.holdState === null || !mayHandOver(rental.holdState)) return { ok: false, reason: 'not_ready' }
  } else if (request.kind === 'condition') {
    const [handover] = await sessionsOf('handover')
    if (handover?.sealedAt === null || handover === undefined || rental.reply !== null || !conditionReplyOpen(handover.sealedAt, now)) return { ok: false, reason: 'not_ready' }
    const open = (await sessionsOf('condition')).find((session) => session.sealedAt === null)
    if (open !== undefined) return { ok: true, sessionId: open.id }
  } else if (request.kind === 'return') {
    const [existing] = await sessionsOf('return')
    if (existing !== undefined) return { ok: true, sessionId: existing.id }
    const [handover] = await sessionsOf('handover')
    if (!['out', 'overdue'].includes(rental.state) || handover?.sealedAt == null) return { ok: false, reason: 'not_ready' }
    planId = handover.planId
  } else {
    return { ok: false, reason: 'not_ready' }
  }
  const [created] = await transaction
    .insert(captureSessions)
    .values({ shopId: rental.shopId, rentalItemId: request.rentalItemId, kind: request.kind, photoPlanId: planId, actorUserId: request.actorUserId, startedAt: now })
    .returning({ id: captureSessions.id })
  if (created === undefined) throw new Error('The session was not created.')
  return { ok: true, sessionId: created.id }
}

type SessionRow = {
  readonly id: string
  readonly shopId: string
  readonly kind: CaptureSessionKind
  readonly rentalId: string
  readonly rentalItemId: string
  readonly itemId: string
  readonly itemLabel: string
  readonly planViews: readonly PhotoPlanView[]
  readonly sealedAt: Date | null
  readonly manifestFingerprint: string | null
  readonly previousManifestFingerprint: string | null
  readonly confirmedMarkIds: readonly string[]
}

async function sessionRow(transaction: Transaction, sessionId: string, lock = false): Promise<SessionRow | undefined> {
  const query = transaction
    .select({
      id: captureSessions.id,
      shopId: captureSessions.shopId,
      kind: captureSessions.kind,
      rentalId: rentalItems.rentalId,
      rentalItemId: captureSessions.rentalItemId,
      itemId: rentalItems.itemId,
      itemLabel: items.label,
      planViews: photoPlans.views,
      sealedAt: captureSessions.sealedAt,
      manifestFingerprint: captureSessions.manifestFingerprint,
      previousManifestFingerprint: captureSessions.previousManifestFingerprint,
      confirmedMarkIds: captureSessions.confirmedMarkIds,
    })
    .from(captureSessions)
    .innerJoin(rentalItems, eq(rentalItems.id, captureSessions.rentalItemId))
    .innerJoin(items, eq(items.id, rentalItems.itemId))
    .innerJoin(photoPlans, eq(photoPlans.id, captureSessions.photoPlanId))
    .where(eq(captureSessions.id, sessionId))
  const [row] = lock ? await query.for('update', { of: captureSessions }) : await query
  return row
}

// The views a session photographs: its plan's for staff, a few free ones for what a renter adds.
function viewsOf(session: Pick<SessionRow, 'kind' | 'planViews'>): readonly PhotoPlanView[] {
  if (session.kind !== 'condition') return session.planViews
  return MISSED_VIEWS.map((key) => ({ key, label: key, outline: 'detail', required: false }))
}

export type SessionMark = { readonly id: string; readonly view: string; readonly region: Region; readonly description: string; readonly confirmed: boolean; readonly new: boolean }

// The item's open marks a session shows: those seen in sealed sessions before, and those this session added. One added
// here is confirmed; an earlier one is confirmed once staff say it is still there.
async function marksFor(transaction: Transaction, session: Pick<SessionRow, 'id' | 'itemId' | 'confirmedMarkIds'>): Promise<readonly SessionMark[]> {
  const rows = await transaction
    .select({ id: marks.id, view: marks.view, region: marks.region, description: marks.description, seenIn: marks.firstSeenSessionId, sealedAt: captureSessions.sealedAt })
    .from(marks)
    .innerJoin(captureSessions, eq(captureSessions.id, marks.firstSeenSessionId))
    .where(and(eq(marks.itemId, session.itemId), eq(marks.status, 'open')))
    .orderBy(asc(marks.view), asc(marks.description))
  return rows
    .filter((row) => row.seenIn === session.id || row.sealedAt !== null)
    .map((row) => ({ id: row.id, view: row.view, region: row.region, description: row.description, new: row.seenIn === session.id, confirmed: row.seenIn === session.id || session.confirmedMarkIds.includes(row.id) }))
}

export type SessionPhoto = { readonly id: string; readonly view: string; readonly displayKey: string | null; readonly receivedAt: Date; readonly simulated?: boolean }

async function currentPhotos(transaction: Transaction, sessionId: string): Promise<readonly SessionPhoto[]> {
  return transaction
    .select({ id: photos.id, view: photos.view, displayKey: photos.displayKey, receivedAt: photos.receivedAt, simulated: sql<boolean>`coalesce((${photos.quality} ->> 'simulated')::int = 1, false)` })
    .from(photos)
    .where(and(eq(photos.sessionId, sessionId), isNull(photos.supersededAt)))
    .orderBy(asc(photos.view))
}

export type CaptureSession = {
  readonly id: string
  readonly kind: CaptureSessionKind
  readonly rentalId: string
  readonly rentalItemId: string
  readonly itemId: string
  readonly itemLabel: string
  readonly plan: readonly PhotoPlanView[]
  readonly photos: readonly SessionPhoto[]
  readonly marks: readonly SessionMark[]
  // The required views still without a photograph, in the plan's order.
  readonly missing: readonly string[]
  readonly sealedAt: Date | null
  readonly previousManifestFingerprint: string | null
}

export async function captureSession(transaction: Transaction, sessionId: string): Promise<CaptureSession | undefined> {
  const row = await sessionRow(transaction, sessionId)
  if (row === undefined) return undefined
  const plan = viewsOf(row)
  const taken = await currentPhotos(transaction, sessionId)
  return {
    id: row.id,
    kind: row.kind,
    rentalId: row.rentalId,
    rentalItemId: row.rentalItemId,
    itemId: row.itemId,
    itemLabel: row.itemLabel,
    plan,
    photos: taken,
    marks: await marksFor(transaction, row),
    missing: missingViews(plan, taken.map((photo) => photo.view)),
    sealedAt: row.sealedAt,
    previousManifestFingerprint: row.previousManifestFingerprint,
  }
}

type Refused<Reason extends string> = { readonly ok: false; readonly reason: Reason }

async function openSession(transaction: Transaction, sessionId: string): Promise<SessionRow | Refused<'not_found' | 'sealed'>> {
  const row = await sessionRow(transaction, sessionId, true)
  if (row === undefined) return { ok: false, reason: 'not_found' }
  if (row.sealedAt !== null) return { ok: false, reason: 'sealed' }
  return row
}

export type NewPhoto = { readonly view: string; readonly evidenceKey: string; readonly sha256: string; readonly quality: PhotoMeasures; readonly simulated?: boolean }

export type RecordPhotoResult = { readonly ok: true; readonly photoId: string } | Refused<'not_found' | 'sealed' | 'unknown_view'>

// Records a photograph that reached the evidence bucket, at the server's time, and queues its display copy. A retake
// takes the view's place; the photograph it replaces stays locked and on record.
export async function recordPhoto(transaction: Transaction, sessionId: string, photo: NewPhoto, now: Date): Promise<RecordPhotoResult> {
  const session = await openSession(transaction, sessionId)
  if ('ok' in session) return session
  if (!viewsOf(session).some((view) => view.key === photo.view)) return { ok: false, reason: 'unknown_view' }
  await transaction.update(photos).set({ supersededAt: now }).where(and(eq(photos.sessionId, sessionId), eq(photos.view, photo.view), isNull(photos.supersededAt)))
  const [created] = await transaction
    .insert(photos)
    .values({ shopId: session.shopId, sessionId, view: photo.view, evidenceKey: photo.evidenceKey, sha256: photo.sha256, receivedAt: now, quality: { ...photo.quality, ...(photo.simulated === true ? { simulated: 1 } : {}) } })
    .returning({ id: photos.id })
  if (created === undefined) throw new Error('The photograph was not recorded.')
  await transaction.insert(outbox).values({ shopId: session.shopId, queue: MEDIA_QUEUE, messageGroup: sessionId, payload: { photoId: created.id }, createdAt: now })
  return { ok: true, photoId: created.id }
}

const DESCRIPTION_LIMIT = 200

export type AddMarkResult = { readonly ok: true; readonly markId: string } | Refused<'not_found' | 'sealed' | 'unknown_view' | 'region_invalid' | 'description_invalid'>

// A mark staff found on the item at this session: a box on one view and a few words. It is on the item from now on,
// so no later renter is charged for it.
export async function addMark(transaction: Transaction, sessionId: string, mark: { readonly view: string; readonly region: Region; readonly description: string }): Promise<AddMarkResult> {
  const session = await openSession(transaction, sessionId)
  if ('ok' in session) return session
  if (!viewsOf(session).some((view) => view.key === mark.view)) return { ok: false, reason: 'unknown_view' }
  if (!checkRegion(mark.region)) return { ok: false, reason: 'region_invalid' }
  const description = mark.description.trim()
  if (description === '' || description.length > DESCRIPTION_LIMIT) return { ok: false, reason: 'description_invalid' }
  const [created] = await transaction.insert(marks).values({ shopId: session.shopId, itemId: session.itemId, view: mark.view, region: mark.region, description, firstSeenSessionId: sessionId }).returning({ id: marks.id })
  if (created === undefined) throw new Error('The mark was not added.')
  return { ok: true, markId: created.id }
}

// Staff say these known marks are still on the item.
export async function confirmMarks(transaction: Transaction, sessionId: string, markIds: readonly string[]): Promise<{ readonly ok: true } | Refused<'not_found' | 'sealed'>> {
  const session = await openSession(transaction, sessionId)
  if ('ok' in session) return session
  const known = new Set((await marksFor(transaction, session)).map((mark) => mark.id))
  if (!markIds.every((id) => known.has(id))) return { ok: false, reason: 'not_found' }
  await transaction
    .update(captureSessions)
    .set({ confirmedMarkIds: [...new Set([...session.confirmedMarkIds, ...markIds])] })
    .where(eq(captureSessions.id, sessionId))
  return { ok: true }
}

export type SealResult = { readonly ok: true; readonly manifestFingerprint: string; readonly rentalOut: boolean } | Refused<'not_found'> | { readonly ok: false; readonly reason: 'views_missing'; readonly views: readonly string[] }

// Seals a session once every required view is photographed: its manifest names each photograph's fingerprint and the
// item's previous manifest, and becomes the item's chain head. A handover sealed for every item hands the rental over.
// Sealing again changes nothing.
export async function sealSession(transaction: Transaction, sessionId: string, now: Date): Promise<SealResult> {
  const session = await sessionRow(transaction, sessionId, true)
  if (session === undefined) return { ok: false, reason: 'not_found' }
  const rentalState = async () => (await transaction.select({ state: rentals.state }).from(rentals).where(eq(rentals.id, session.rentalId)))[0]?.state
  if (session.sealedAt !== null && session.manifestFingerprint !== null) return { ok: true, manifestFingerprint: session.manifestFingerprint, rentalOut: (await rentalState()) === 'out' }

  const taken = await transaction.select({ view: photos.view, sha256: photos.sha256, receivedAt: photos.receivedAt }).from(photos).where(and(eq(photos.sessionId, sessionId), isNull(photos.supersededAt)))
  const missing = missingViews(viewsOf(session), taken.map((photo) => photo.view))
  if (missing.length > 0 || taken.length === 0) return { ok: false, reason: 'views_missing', views: missing }

  const [item] = await transaction.select({ head: items.chainHeadFingerprint }).from(items).where(eq(items.id, session.itemId)).for('update')
  const previous = item?.head ?? null
  const manifest = manifestText({ sessionId, itemId: session.itemId, kind: session.kind, sealedAt: now, previousManifestFingerprint: previous, photos: taken })
  const fingerprint = fingerprintOf(manifest)
  await transaction.update(captureSessions).set({ sealedAt: now, manifest, manifestFingerprint: fingerprint, previousManifestFingerprint: previous }).where(eq(captureSessions.id, sessionId))
  await transaction.update(items).set({ chainHeadFingerprint: fingerprint }).where(eq(items.id, session.itemId))

  if (session.kind === 'handover') {
    const all = await transaction.select({ id: rentalItems.id }).from(rentalItems).where(eq(rentalItems.rentalId, session.rentalId))
    const sealed = await transaction
      .select({ id: captureSessions.rentalItemId })
      .from(captureSessions)
      .where(and(inArray(captureSessions.rentalItemId, all.map((row) => row.id)), eq(captureSessions.kind, 'handover'), isNotNull(captureSessions.sealedAt)))
    const [rental] = await transaction.select({ state: rentals.state }).from(rentals).where(eq(rentals.id, session.rentalId)).for('update')
    if (rental !== undefined && sealed.length === all.length && transition(RENTAL_TRANSITIONS, rental.state, 'out').ok) {
      await transaction.update(rentals).set({ state: 'out' }).where(eq(rentals.id, session.rentalId))
    }
  }
  if (session.kind === 'return') await queueReturnComparisons(transaction, session.rentalId, now)
  return { ok: true, manifestFingerprint: fingerprint, rentalOut: (await rentalState()) === 'out' }
}

export type ConditionReport = {
  readonly open: boolean
  readonly reply: ConditionReply | null
  readonly closesAt: Date
  readonly items: readonly {
    readonly rentalItemId: string
    readonly label: string
    readonly sessionId: string
    readonly sealedAt: Date
    readonly photos: readonly SessionPhoto[]
    // The marks staff recorded at the handover: new ones, and known ones they confirmed.
    readonly marks: readonly SessionMark[]
    // What the renter added in a sealed condition session.
    readonly added: readonly SessionPhoto[]
  }[]
}

// What the renter sees after the handover: each item's photographs and marks, and whether they may still reply.
// Nothing before the first item is handed over.
export async function conditionReport(transaction: Transaction, rentalId: string, now: Date): Promise<ConditionReport | undefined> {
  const [rental] = await transaction.select({ reply: rentals.conditionReply }).from(rentals).where(eq(rentals.id, rentalId))
  if (rental === undefined) return undefined
  const sessions = await transaction
    .select({ id: captureSessions.id, kind: captureSessions.kind, rentalItemId: captureSessions.rentalItemId, sealedAt: captureSessions.sealedAt })
    .from(captureSessions)
    .innerJoin(rentalItems, eq(rentalItems.id, captureSessions.rentalItemId))
    .where(and(eq(rentalItems.rentalId, rentalId), isNotNull(captureSessions.sealedAt), inArray(captureSessions.kind, ['handover', 'condition'])))
    .orderBy(asc(captureSessions.sealedAt))
  const handovers = sessions.filter((session) => session.kind === 'handover')
  const last = handovers.at(-1)?.sealedAt
  if (last === undefined || last === null) return undefined
  const reportItems = []
  for (const handover of handovers) {
    const row = await sessionRow(transaction, handover.id)
    if (row === undefined || row.sealedAt === null) continue
    const added = []
    for (const condition of sessions.filter((session) => session.kind === 'condition' && session.rentalItemId === handover.rentalItemId)) added.push(...(await currentPhotos(transaction, condition.id)))
    reportItems.push({ rentalItemId: row.rentalItemId, label: row.itemLabel, sessionId: row.id, sealedAt: row.sealedAt, photos: await currentPhotos(transaction, row.id), marks: (await marksFor(transaction, row)).filter((mark) => mark.confirmed), added })
  }
  return { open: rental.reply === null && conditionReplyOpen(last, now), reply: rental.reply, closesAt: new Date(last.getTime() + CONDITION_REPLY_HOURS * 3_600_000), items: reportItems }
}

export type ReplyResult = { readonly ok: true } | Refused<'not_found' | 'not_handed_over' | 'already_replied' | 'closed' | 'nothing_added'>

// The renter's answer to the condition report: it matches what they were given, or they added what staff missed.
export async function replyToCondition(transaction: Transaction, rentalId: string, reply: { readonly kind: ConditionReply }, now: Date): Promise<ReplyResult> {
  const [rental] = await transaction.select({ reply: rentals.conditionReply }).from(rentals).where(eq(rentals.id, rentalId)).for('update')
  if (rental === undefined) return { ok: false, reason: 'not_found' }
  const report = await conditionReport(transaction, rentalId, now)
  if (report === undefined) return { ok: false, reason: 'not_handed_over' }
  if (rental.reply !== null) return { ok: false, reason: 'already_replied' }
  if (!report.open) return { ok: false, reason: 'closed' }
  if (reply.kind === 'added' && !report.items.some((item) => item.added.length > 0)) return { ok: false, reason: 'nothing_added' }
  await transaction.update(rentals).set({ conditionReply: reply.kind, conditionRepliedAt: now }).where(eq(rentals.id, rentalId))
  return { ok: true }
}

// The rental's line for one of its items, which a session is started on.
export async function rentalItemFor(transaction: Transaction, rentalId: string, itemId: string): Promise<string | undefined> {
  const [row] = await transaction.select({ id: rentalItems.id }).from(rentalItems).where(and(eq(rentalItems.rentalId, rentalId), eq(rentalItems.itemId, itemId)))
  return row?.id
}

// What the worker needs to make a photograph's display copy.
export async function photoForDisplay(transaction: Transaction, photoId: string): Promise<{ readonly evidenceKey: string; readonly displayKey: string | null } | undefined> {
  const [row] = await transaction.select({ evidenceKey: photos.evidenceKey, displayKey: photos.displayKey }).from(photos).where(eq(photos.id, photoId))
  return row
}

// Records the display copy and the perceptual fingerprint, once. False when the photograph already has its copy.
export async function recordDisplayCopy(transaction: Transaction, photoId: string, displayKey: string, perceptualHash: string): Promise<boolean> {
  const updated = await transaction.update(photos).set({ displayKey, perceptualHash }).where(and(eq(photos.id, photoId), isNull(photos.displayKey))).returning({ id: photos.id })
  return updated.length === 1
}

// The photograph's media message reached its queue, sent at once after it was recorded.
export async function markPhotoMessageSent(transaction: Transaction, photoId: string, now: Date): Promise<void> {
  await transaction.update(outbox).set({ state: 'sent', sentAt: now }).where(and(eq(outbox.queue, MEDIA_QUEUE), eq(outbox.state, 'pending'), sql`${outbox.payload} ->> 'photoId' = ${photoId}`))
}

export type RentalHandover = { readonly itemId: string; readonly label: string; readonly sessionId: string | null; readonly sealed: boolean }

// Each item of a rental and its handover, if one is started, for staff to start, continue or see sealed.
export async function rentalHandovers(transaction: Transaction, rentalId: string): Promise<readonly RentalHandover[]> {
  const rows = await transaction
    .select({ itemId: rentalItems.itemId, label: items.label, sessionId: captureSessions.id, sealedAt: captureSessions.sealedAt })
    .from(rentalItems)
    .innerJoin(items, eq(items.id, rentalItems.itemId))
    .leftJoin(captureSessions, and(eq(captureSessions.rentalItemId, rentalItems.id), eq(captureSessions.kind, 'handover')))
    .where(eq(rentalItems.rentalId, rentalId))
    .orderBy(asc(rentalItems.id))
  return rows.map((row) => ({ itemId: row.itemId, label: row.label, sessionId: row.sessionId, sealed: row.sealedAt !== null }))
}

// The renter's condition sessions not yet sent, one per item they added photographs to.
export async function openConditionSessions(transaction: Transaction, rentalId: string): Promise<readonly string[]> {
  const rows = await transaction
    .select({ id: captureSessions.id })
    .from(captureSessions)
    .innerJoin(rentalItems, eq(rentalItems.id, captureSessions.rentalItemId))
    .where(and(eq(rentalItems.rentalId, rentalId), eq(captureSessions.kind, 'condition'), isNull(captureSessions.sealedAt)))
  return rows.map((row) => row.id)
}
