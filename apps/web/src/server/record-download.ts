import 'server-only'
import { evidencePackFor } from '@hold/db'
import type { EvidenceSnapshot, Transaction } from '@hold/db'
import { Refusal } from './action'
import { getServices } from './services'

export const renterCanReadRecord = (snapshot: EvidenceSnapshot) => snapshot.claim === null || !['draft', 'awaiting_approval'].includes(snapshot.claim.state)

export async function recordDownload(transaction: Transaction, rentalId: string, packId: string, kind: 'pdf' | 'manifest', shared: boolean) {
  const pack = await evidencePackFor(transaction, rentalId, packId)
  if (pack === undefined || (shared && !renterCanReadRecord(pack.snapshot))) return new Refusal('not_found')
  if (pack.state !== 'ready' || pack.pdfVersionId === null || pack.manifestVersionId === null) return new Refusal('record_pending')
  const { documents } = await getServices()
  if (documents === undefined) return new Refusal('storage_unavailable')
  const filename = kind === 'pdf' ? `rental-record-v${String(pack.version)}.pdf` : `rental-manifest-v${String(pack.version)}.json`
  const key = kind === 'pdf' ? pack.evidenceKey : pack.evidenceKey.replace(/record\.pdf$/, 'manifest.json')
  const versionId = kind === 'pdf' ? pack.pdfVersionId : pack.manifestVersionId
  return { url: await documents.downloadLink(key, versionId, filename), filename }
}
