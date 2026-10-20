import { createHash } from 'node:crypto'
import { evidenceBuildState, inShop, loadEvidenceBuild, publishEvidencePack } from '@hold/db'
import type { Database, DatabaseRole } from '@hold/db'
import { z } from 'zod'
import type { DocumentStore } from './document-port.ts'
import { evidenceManifest } from './evidence-manifest.ts'
import { renderEvidencePdf } from './evidence-renderer.ts'
import type { EvidenceStore } from './port.ts'

export const evidenceMessageSchema = z.strictObject({ shopId: z.uuid(), packId: z.uuid() })

export class EvidenceBuildError extends Error {
  readonly code: 'display_pending' | 'artifact_failed'
  constructor(code: EvidenceBuildError['code']) {
    super(code)
    this.name = 'EvidenceBuildError'
    this.code = code
  }
}

export type EvidencePackDependencies = {
  readonly database: Database
  readonly role?: DatabaseRole
  readonly evidence: EvidenceStore
  readonly documents: DocumentStore
}

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

export async function makeEvidencePack(dependencies: EvidencePackDependencies, input: z.infer<typeof evidenceMessageSchema>): Promise<'made' | 'nothing_to_do'> {
  const message = evidenceMessageSchema.parse(input)
  const scope = { role: dependencies.role ?? 'hold_worker', shopId: message.shopId } as const
  let loaded = false
  try {
    const pack = await inShop(dependencies.database, scope, (transaction) => loadEvidenceBuild(transaction, message.packId))
    if (pack === undefined || pack.state === 'ready') return 'nothing_to_do'
    loaded = true
    await inShop(dependencies.database, scope, (transaction) => evidenceBuildState(transaction, pack.id, 'building', null))
    const photos = new Map<string, Buffer>()
    for (const item of pack.snapshot.items) {
      for (const session of item.sessions) {
        for (const photo of session.photos) {
          const display = await dependencies.evidence.readDisplay(photo.displayKey)
          if (display === undefined) throw new EvidenceBuildError('display_pending')
          photos.set(photo.id, display)
        }
      }
    }
    const snapshot = Buffer.from(JSON.stringify(pack.snapshot))
    if (sha256(snapshot) !== pack.sourceFingerprint || !pack.evidenceKey.endsWith('/record.pdf')) throw new EvidenceBuildError('artifact_failed')
    const hashes = new Map([...photos].map(([id, bytes]) => [id, sha256(bytes)]))
    const manifest = Buffer.from(evidenceManifest(pack.snapshot, hashes))
    const pdf = await renderEvidencePdf({ snapshot: pack.snapshot, version: pack.version, createdAt: pack.createdAt, photos })
    const snapshotObject = await dependencies.documents.put(pack.evidenceKey.replace(/record\.pdf$/, 'snapshot.json'), snapshot, 'application/json')
    const manifestObject = await dependencies.documents.put(pack.evidenceKey.replace(/record\.pdf$/, 'manifest.json'), manifest, 'application/json')
    const pdfObject = await dependencies.documents.put(pack.evidenceKey, pdf, 'application/pdf')
    if (snapshotObject.sha256 !== sha256(snapshot) || manifestObject.sha256 !== sha256(manifest) || pdfObject.sha256 !== sha256(pdf)) throw new EvidenceBuildError('artifact_failed')
    const published = await inShop(dependencies.database, scope, (transaction) => publishEvidencePack(transaction, pack.id, {
      pdfSha256: pdfObject.sha256, manifestSha256: manifestObject.sha256,
      pdfVersionId: pdfObject.versionId, manifestVersionId: manifestObject.versionId, snapshotVersionId: snapshotObject.versionId,
    }))
    return published ? 'made' : 'nothing_to_do'
  } catch (error) {
    const code = error instanceof EvidenceBuildError ? error.code : 'artifact_failed'
    if (loaded) {
      try {
        await inShop(dependencies.database, scope, (transaction) => evidenceBuildState(transaction, message.packId, 'failed', code))
      } catch {
        throw new EvidenceBuildError('artifact_failed')
      }
    }
    // Storage/database diagnostics can contain credentials and private keys; only retry codes cross the job boundary.
    throw new EvidenceBuildError(code)
  }
}
