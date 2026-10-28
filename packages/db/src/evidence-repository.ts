import { createHash } from 'node:crypto'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { evidenceSnapshot } from './evidence-snapshot.ts'
import { evidenceSnapshotSchema } from './evidence-snapshot-schema.ts'
import { auditLog, evidencePacks, outbox, receiptDeliveries, rentals } from './schema/index.ts'
import type { Transaction } from './scope.ts'

export async function reserveEvidencePack(transaction: Transaction, rentalId: string, now: Date) {
  const [rental] = await transaction.select({ id: rentals.id, shopId: rentals.shopId }).from(rentals).where(eq(rentals.id, rentalId)).for('update')
  if (rental === undefined) return undefined
  const snapshot = await evidenceSnapshot(transaction, rentalId)
  if (snapshot === undefined) return undefined
  const sourceFingerprint = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
  const [existing] = await transaction.select().from(evidencePacks).where(and(eq(evidencePacks.rentalId, rentalId), eq(evidencePacks.sourceFingerprint, sourceFingerprint)))
  if (existing !== undefined) {
    if (existing.state === 'failed') await transaction.insert(outbox).values({ shopId: rental.shopId, queue: 'evidence', messageGroup: rentalId, payload: { packId: existing.id }, createdAt: now })
    return existing
  }
  const [last] = await transaction.select({ version: evidencePacks.version }).from(evidencePacks).where(eq(evidencePacks.rentalId, rentalId)).orderBy(desc(evidencePacks.version)).limit(1)
  const version = (last?.version ?? 0) + 1
  const evidenceKey = `packs/${rental.shopId}/${rentalId}/${String(version)}/record.pdf`
  const [pack] = await transaction.insert(evidencePacks).values({ shopId: rental.shopId, rentalId, version, snapshot, sourceFingerprint, evidenceKey, manifestFingerprint: '', createdAt: now }).returning()
  if (pack === undefined) throw new Error('Evidence version was not reserved.')
  await transaction.insert(outbox).values({ shopId: rental.shopId, queue: 'evidence', messageGroup: rentalId, payload: { packId: pack.id }, createdAt: now })
  return pack
}

export async function evidencePackFor(transaction: Transaction, rentalId: string, packId: string) {
  const [pack] = await transaction.select().from(evidencePacks).where(and(eq(evidencePacks.id, packId), eq(evidencePacks.rentalId, rentalId)))
  return pack === undefined ? undefined : { ...pack, snapshot: evidenceSnapshotSchema.parse(pack.snapshot) }
}

export async function loadEvidenceBuild(transaction: Transaction, packId: string) {
  const [pack] = await transaction.select().from(evidencePacks).where(eq(evidencePacks.id, packId))
  return pack === undefined ? undefined : { ...pack, snapshot: evidenceSnapshotSchema.parse(pack.snapshot) }
}

// Only these fields leave the server when the version list is displayed.
export async function evidenceVersions(transaction: Transaction, rentalId: string, shared = false) {
  return transaction.select({ id: evidencePacks.id, version: evidencePacks.version, state: evidencePacks.state, createdAt: evidencePacks.createdAt, pdfSha256: evidencePacks.pdfSha256, manifestFingerprint: evidencePacks.manifestFingerprint }).from(evidencePacks).where(and(eq(evidencePacks.rentalId, rentalId), shared ? sql`coalesce(${evidencePacks.snapshot}->'claim'->>'state', '') not in ('draft', 'awaiting_approval')` : undefined)).orderBy(desc(evidencePacks.version))
}
export type EvidenceVersion = Awaited<ReturnType<typeof evidenceVersions>>[number]

// The rental's latest published record, as the PDF a dispute answer attaches. Nothing until one is published.
export async function publishedEvidencePack(transaction: Transaction, rentalId: string) {
  const [pack] = await transaction.select({ evidenceKey: evidencePacks.evidenceKey, pdfVersionId: evidencePacks.pdfVersionId, version: evidencePacks.version }).from(evidencePacks)
    .where(and(eq(evidencePacks.rentalId, rentalId), eq(evidencePacks.state, 'ready'))).orderBy(desc(evidencePacks.version)).limit(1)
  return pack === undefined || pack.pdfVersionId === null ? undefined : { evidenceKey: pack.evidenceKey, pdfVersionId: pack.pdfVersionId, version: pack.version }
}

export const evidenceArtifactsSchema = z.strictObject({ pdfSha256: z.string().regex(/^[a-f0-9]{64}$/), manifestSha256: z.string().regex(/^[a-f0-9]{64}$/), pdfVersionId: z.string().min(1), manifestVersionId: z.string().min(1), snapshotVersionId: z.string().min(1) })
export async function publishEvidencePack(transaction: Transaction, packId: string, input: z.infer<typeof evidenceArtifactsSchema>) {
  const artifacts = evidenceArtifactsSchema.parse(input)
  const [pack] = await transaction.update(evidencePacks).set({ state: 'ready', pdfSha256: artifacts.pdfSha256, manifestFingerprint: artifacts.manifestSha256, pdfVersionId: artifacts.pdfVersionId, manifestVersionId: artifacts.manifestVersionId, snapshotVersionId: artifacts.snapshotVersionId, lastError: null }).where(and(eq(evidencePacks.id, packId), eq(evidencePacks.state, 'building'))).returning({ id: evidencePacks.id, shopId: evidencePacks.shopId, rentalId: evidencePacks.rentalId })
  if (pack === undefined) return false
  await transaction.insert(auditLog).values({ shopId: pack.shopId, actorKind: 'worker', action: 'evidence.published', subjectKind: 'rental', subjectId: pack.rentalId, detail: { packId } })
  const receipts = await transaction.select({ id: receiptDeliveries.id }).from(receiptDeliveries).where(and(eq(receiptDeliveries.packId, packId), eq(receiptDeliveries.status, 'queued')))
  for (const receipt of receipts) await transaction.insert(outbox).values({ shopId: pack.shopId, queue: 'messages', messageGroup: pack.rentalId, payload: { receiptId: receipt.id } })
  return true
}

export async function evidenceBuildState(transaction: Transaction, packId: string, state: 'building' | 'failed', reason: 'display_pending' | 'artifact_failed' | null) {
  await transaction.update(evidencePacks).set({ state, lastError: reason }).where(and(eq(evidencePacks.id, packId), eq(evidencePacks.state, state === 'building' ? 'failed' : 'building')))
}

export async function pendingEvidenceWork(transaction: Transaction) {
  return transaction.select().from(outbox).where(and(eq(outbox.state, 'pending'), inArray(outbox.queue, ['evidence', 'messages']))).orderBy(asc(outbox.createdAt), asc(outbox.id)).limit(100)
}
