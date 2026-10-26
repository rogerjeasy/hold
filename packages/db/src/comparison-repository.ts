import { reserveEvidencePack } from './evidence-repository.ts'
import { INSPECTION_LIMITS, RENTAL_TRANSITIONS, transition } from '@hold/domain'
import { and, asc, eq, inArray, isNotNull, isNull, lte, ne, sql } from 'drizzle-orm'
import { auditLog, captureSessions, comparisons, findings, incidents, itemTypes, items, marks, photoPlans, photos, priceEntries, rentalItems, rentals, users, wearPolicies } from './schema/index.ts'
import type { Transaction } from './scope.ts'

export type ComparisonPhoto = Pick<typeof photos.$inferSelect, 'view' | 'evidenceKey' | 'sha256' | 'perceptualHash' | 'displayKey' | 'quality'>

async function sessionPhotos(transaction: Transaction, sessionId: string): Promise<readonly ComparisonPhoto[]> {
  return transaction.select({ view: photos.view, evidenceKey: photos.evidenceKey, sha256: photos.sha256, perceptualHash: photos.perceptualHash, displayKey: photos.displayKey, quality: photos.quality }).from(photos)
    .where(and(eq(photos.sessionId, sessionId), isNull(photos.supersededAt))).orderBy(asc(photos.view))
}

export async function beginComparison(transaction: Transaction, comparisonId: string, now: Date) {
  const [comparison] = await transaction.select().from(comparisons).where(eq(comparisons.id, comparisonId)).for('update')
  if (comparison === undefined || !['pending', 'running'].includes(comparison.state)) return undefined
  if (comparison.state === 'running' && comparison.startedAt !== null && now.getTime() - comparison.startedAt.getTime() < INSPECTION_LIMITS.maxMilliseconds + 60_000) return undefined
  const [returned] = await transaction.select().from(captureSessions).where(eq(captureSessions.id, comparison.returnSessionId))
  const [handover] = await transaction.select().from(captureSessions).where(eq(captureSessions.id, comparison.handoverSessionId))
  if (returned?.kind !== 'return' || handover?.kind !== 'handover' || returned.sealedAt === null || handover.sealedAt === null || returned.rentalItemId !== handover.rentalItemId) return undefined
  const [rental] = await transaction.select({ id: rentals.id, state: rentals.state, priceListId: rentals.priceListId, wearPolicy: wearPolicies.rules, itemType: itemTypes.name, itemId: items.id })
    .from(rentalItems).innerJoin(rentals, eq(rentals.id, rentalItems.rentalId)).innerJoin(wearPolicies, eq(wearPolicies.id, rentals.wearPolicyId))
    .innerJoin(items, eq(items.id, rentalItems.itemId)).innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
    .where(eq(rentalItems.id, returned.rentalItemId)).for('update', { of: rentals })
  if (rental === undefined || !['returned', 'inspecting'].includes(rental.state)) return undefined
  if (transition(RENTAL_TRANSITIONS, rental.state, 'inspecting').ok) await transaction.update(rentals).set({ state: 'inspecting' }).where(eq(rentals.id, rental.id))
  await transaction.update(comparisons).set({ state: 'running', startedAt: now }).where(eq(comparisons.id, comparisonId))
  const [plan] = await transaction.select({ views: photoPlans.views }).from(photoPlans).where(eq(photoPlans.id, handover.photoPlanId))
  const known = await transaction.select({ id: marks.id, view: marks.view, region: marks.region }).from(marks)
    .innerJoin(captureSessions, eq(captureSessions.id, marks.firstSeenSessionId))
    .where(and(eq(marks.itemId, rental.itemId), eq(marks.status, 'open'), lte(captureSessions.sealedAt, handover.sealedAt)))
  // Marks the renter reported during this rental (step 7): covered when the report was agreed or made the shop's matter.
  // Reporting does not make a mark old, so they are never among the known marks above.
  const reported = (await transaction.select({ id: marks.id, view: marks.view, region: marks.region, state: incidents.state }).from(marks)
    .innerJoin(incidents, eq(incidents.id, marks.incidentId))
    .where(and(eq(marks.itemId, rental.itemId), eq(marks.status, 'reported'), eq(incidents.rentalItemId, returned.rentalItemId))))
    .map(({ state, ...mark }) => ({ ...mark, covered: state === 'agreed' || state === 'shop_matter' }))
  const prices = await transaction.select({ id: priceEntries.id, code: priceEntries.code }).from(priceEntries).where(eq(priceEntries.priceListId, rental.priceListId))
  const previous = await transaction.select({ sha256: photos.sha256, perceptualHash: photos.perceptualHash }).from(photos)
    .innerJoin(captureSessions, eq(captureSessions.id, photos.sessionId))
    .innerJoin(rentalItems, eq(rentalItems.id, captureSessions.rentalItemId))
    .where(and(eq(rentalItems.itemId, rental.itemId), ne(captureSessions.id, returned.id), isNotNull(captureSessions.sealedAt), lte(captureSessions.sealedAt, returned.startedAt), inArray(captureSessions.kind, ['handover', 'condition', 'return', 'incident'])))
  // The current return is excluded even when test clocks give it the same timestamp as handover.
  const baseline = await sessionPhotos(transaction, handover.id)
  return { id: comparison.id, shopId: comparison.shopId, rentalId: rental.id, startedAt: now, plan: plan?.views ?? [], before: baseline, after: await sessionPhotos(transaction, returned.id), known, reported, prices, wearPolicy: rental.wearPolicy, itemType: rental.itemType, previous }
}

export type StoredInspection = { readonly state: 'clean' | 'findings' | 'deferred'; readonly model: string; readonly promptVersion: string; readonly alignment: Readonly<Record<string, number>>; readonly reason: string | null; readonly simulated: boolean; readonly findings: readonly Pick<typeof findings.$inferInsert, 'view' | 'region' | 'class' | 'confidence' | 'description' | 'secondLookConfirmed' | 'matchedMarkId' | 'suggestedPriceEntryId'>[] }

export async function completeComparison(transaction: Transaction, comparisonId: string, lease: Date, result: StoredInspection, now: Date): Promise<boolean> {
  const [updated] = await transaction.update(comparisons).set({ state: result.state, model: result.model, promptVersion: result.promptVersion, alignment: result.alignment, completedAt: now, deferredReason: result.reason, simulated: result.simulated })
    .where(and(eq(comparisons.id, comparisonId), eq(comparisons.state, 'running'), eq(comparisons.startedAt, lease))).returning({ shopId: comparisons.shopId })
  if (updated === undefined) return false
  for (const finding of result.findings) await transaction.insert(findings).values({ ...finding, shopId: updated.shopId, comparisonId })
  await transaction.insert(auditLog).values({ shopId: updated.shopId, actorKind: 'worker', action: 'comparison.completed', subjectKind: 'comparison', subjectId: comparisonId, detail: { state: result.state, reason: result.reason, model: result.model, promptVersion: result.promptVersion, simulated: result.simulated }, at: now })
  const [rental] = await transaction.select({ id: rentalItems.rentalId }).from(comparisons).innerJoin(captureSessions, eq(captureSessions.id, comparisons.returnSessionId)).innerJoin(rentalItems, eq(rentalItems.id, captureSessions.rentalItemId)).where(eq(comparisons.id, comparisonId))
  if (rental !== undefined) await reserveEvidencePack(transaction, rental.id, now)
  return true
}

// A staff-facing report contains display keys, never original keys or photograph fingerprints.
export async function comparisonReport(transaction: Transaction, comparisonId: string) {
  const [comparison] = await transaction.select().from(comparisons).where(eq(comparisons.id, comparisonId))
  if (comparison === undefined) return undefined
  const [session] = await transaction.select({ rentalId: rentalItems.rentalId, label: items.label }).from(captureSessions)
    .innerJoin(rentalItems, eq(rentalItems.id, captureSessions.rentalItemId)).innerJoin(items, eq(items.id, rentalItems.itemId)).where(eq(captureSessions.id, comparison.returnSessionId))
  if (session === undefined) return undefined
  const rows = await transaction.select({ id: findings.id, view: findings.view, region: findings.region, class: findings.class, confidence: findings.confidence, description: findings.description, secondLookConfirmed: findings.secondLookConfirmed, priceDescription: priceEntries.description, amountCents: priceEntries.amountCents, currency: priceEntries.currency, incidentId: incidents.id, incidentState: incidents.state, agreedCents: incidents.agreedCents, incidentCurrency: incidents.currency }).from(findings)
    .leftJoin(priceEntries, eq(priceEntries.id, findings.suggestedPriceEntryId)).leftJoin(marks, eq(marks.id, findings.matchedMarkId)).leftJoin(incidents, eq(incidents.id, marks.incidentId))
    .where(eq(findings.comparisonId, comparisonId)).orderBy(asc(findings.view), asc(findings.id))
  // A finding over a mark the renter reported during this rental names that report and any line they agreed (step 7).
  const observed = rows.map(({ incidentId, incidentState, agreedCents, incidentCurrency, ...finding }) => ({ ...finding, reported: incidentId === null || incidentState === null || incidentCurrency === null ? null : { incidentId, state: incidentState, agreedCents, currency: incidentCurrency } }))
  const displayPhotos = async (sessionId: string) => (await sessionPhotos(transaction, sessionId)).map(({ view, displayKey }) => ({ view, displayKey }))
  const reviews = await transaction.select({ actorName: users.name, at: auditLog.at, detail: auditLog.detail }).from(auditLog)
    .leftJoin(users, sql`${users.id}::text = ${auditLog.actorId}`).where(and(eq(auditLog.subjectKind, 'comparison'), eq(auditLog.subjectId, comparisonId), eq(auditLog.action, 'comparison.manual_review'))).orderBy(asc(auditLog.at))
  return { id: comparison.id, ...session, state: comparison.state, model: comparison.model, promptVersion: comparison.promptVersion, deferredReason: comparison.deferredReason, simulated: comparison.simulated, before: await displayPhotos(comparison.handoverSessionId), after: await displayPhotos(comparison.returnSessionId), findings: observed, reviews }
}

export type ComparisonReport = NonNullable<Awaited<ReturnType<typeof comparisonReport>>>
