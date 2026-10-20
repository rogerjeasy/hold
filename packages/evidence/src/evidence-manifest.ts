import { createHash } from 'node:crypto'
import type { EvidenceSnapshot } from '@hold/db'
import { z } from 'zod'

export class EvidenceRenderError extends Error {
  readonly code: 'corrupt_manifest' | 'missing_display_photo' | 'invalid_display_photo'
  readonly reference: string
  constructor(code: EvidenceRenderError['code'], reference: string) {
    super(`${code}: ${reference}`)
    this.name = 'EvidenceRenderError'
    this.code = code
    this.reference = reference
  }
}
const sealedManifest = z.strictObject({
  session: z.uuid(), item: z.uuid(), kind: z.string(), sealedAt: z.iso.datetime({ offset: true }), previous: z.string().nullable(),
  photos: z.array(z.strictObject({ view: z.string(), sha256: z.string(), receivedAt: z.iso.datetime({ offset: true }) })),
})
const order = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0

function checkedSession(itemId: string, session: EvidenceSnapshot['items'][number]['sessions'][number]) {
  const digest = createHash('sha256').update(session.manifest).digest('hex')
  if (digest !== session.manifestFingerprint) throw new EvidenceRenderError('corrupt_manifest', session.id)
  let value: unknown
  try { value = JSON.parse(session.manifest) } catch { throw new EvidenceRenderError('corrupt_manifest', session.id) }
  const parsed = sealedManifest.safeParse(value)
  if (!parsed.success) throw new EvidenceRenderError('corrupt_manifest', session.id)
  const manifest = parsed.data
  const expectedPhotos = session.photos.filter((photo) => photo.supersededAt === null).map(({ view, sha256, receivedAt }) => ({ view, sha256, receivedAt })).sort((a, b) => order(a.view, b.view))
  if (manifest.item !== itemId || manifest.session !== session.id || manifest.kind !== session.kind || new Date(manifest.sealedAt).getTime() !== new Date(session.sealedAt).getTime() || manifest.previous !== session.previousManifestFingerprint || JSON.stringify(manifest.photos.map((photo) => ({ ...photo, receivedAt: new Date(photo.receivedAt).toISOString() }))) !== JSON.stringify(expectedPhotos.map((photo) => ({ ...photo, receivedAt: new Date(photo.receivedAt).toISOString() })))) throw new EvidenceRenderError('corrupt_manifest', session.id)
  return manifest
}

/** Shared record only: original storage locations and renter tokens never enter this export. */
export function evidenceManifest(snapshot: EvidenceSnapshot, displayHashes: ReadonlyMap<string, string>): string {
  const items = [...snapshot.items].sort((a, b) => order(a.id, b.id)).map((item) => ({
    id: item.id,
    sessions: [...item.sessions].sort((a, b) => order(a.id, b.id)).map((session) => {
      const manifest = checkedSession(item.id, session)
      return {
        id: session.id, kind: session.kind, sealedAt: session.sealedAt,
        manifest, manifestFingerprint: session.manifestFingerprint, previousManifestFingerprint: session.previousManifestFingerprint,
        photos: [...session.photos].sort((a, b) => order(a.id, b.id)).map((photo) => {
          const displaySha256 = displayHashes.get(photo.id)
          if (displaySha256 === undefined || !/^[a-f0-9]{64}$/.test(displaySha256)) throw new EvidenceRenderError('missing_display_photo', photo.id)
          return { id: photo.id, view: photo.view, originalSha256: photo.sha256, receivedAt: photo.receivedAt, supersededAt: photo.supersededAt, simulated: photo.simulated, displaySha256 }
        }),
      }
    }),
  }))
  return JSON.stringify({ schemaVersion: 1, rentalId: snapshot.rental.id, items })
}
