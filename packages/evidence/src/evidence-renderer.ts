import { createHash } from 'node:crypto'
import type { EvidenceSnapshot } from '@hold/db'
import PDFDocument from 'pdfkit'
import { renderAgreement, renderComparisons, renderDecisions, renderFingerprints, renderPayments } from './evidence-document-content.ts'
import { documentLabels } from './evidence-document-labels.ts'
import { evidenceDocument } from './evidence-document-layout.ts'
import { renderItemPhotos } from './evidence-document-photos.ts'
import { evidenceManifest } from './evidence-manifest.ts'

export const EVIDENCE_RENDERER_VERSION = '1'
export interface EvidencePdfInput {
  readonly snapshot: EvidenceSnapshot
  readonly version: number
  readonly createdAt: Date
  /** Face-blurred JPEG display copies, keyed by photograph identity. Never supply originals. */
  readonly photos: ReadonlyMap<string, Buffer>
}

export async function renderEvidencePdf({ snapshot, version, createdAt, photos }: EvidencePdfInput): Promise<Buffer> {
  const hashes = new Map([...photos].map(([id, bytes]) => [id, createHash('sha256').update(bytes).digest('hex')]))
  evidenceManifest(snapshot, hashes)
  const label = documentLabels(snapshot.rental.language)
  // PDFKit derives its file ID from metadata. Pin both dates so publication retries reproduce the same bytes.
  const doc = new PDFDocument({ size: 'A4', margins: { top: 64, right: 44, bottom: 50, left: 44 }, bufferPages: true, compress: false, info: { Title: label('title'), Author: snapshot.shop.name, Creator: `Hold evidence renderer ${EVIDENCE_RENDERER_VERSION}`, CreationDate: createdAt, ModDate: createdAt } })
  const chunks: Buffer[] = []
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => { resolve(Buffer.concat(chunks)) })
    doc.on('error', reject)
  })
  try {
    const context = evidenceDocument(doc, label, snapshot.shop.name)
    renderAgreement(context, snapshot, version, createdAt)
    renderItemPhotos(context, snapshot, photos)
    renderComparisons(context, snapshot)
    renderDecisions(context, snapshot)
    renderPayments(context, snapshot)
    renderFingerprints(context, snapshot, hashes)
    context.footers()
    doc.end()
  } catch (error) {
    doc.destroy()
    throw error
  }
  return complete
}
