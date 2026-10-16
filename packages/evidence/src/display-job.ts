import { inShop, photoForDisplay, recordDisplayCopy } from '@hold/db'
import type { Database, DatabaseRole } from '@hold/db'
import { displayCopy, perceptualHash } from '@hold/vision'
import type { FaceFinder } from '@hold/vision'
import type { EvidenceStore } from './port.ts'

// The worker's job for each recorded photograph (architecture.md section 9.3): the copy people see, smaller, with faces
// blurred and no metadata, and the perceptual fingerprint that flags a photograph used again. Done once.

export type DisplayJobDependencies = {
  readonly database: Database
  readonly role?: DatabaseRole
  readonly evidence: EvidenceStore
  readonly faces: FaceFinder
}

export async function makeDisplayCopy(dependencies: DisplayJobDependencies, message: { readonly shopId: string; readonly photoId: string }): Promise<'made' | 'nothing_to_do'> {
  const scope = { role: dependencies.role ?? 'hold_worker', shopId: message.shopId } as const
  const photo = await inShop(dependencies.database, scope, (transaction) => photoForDisplay(transaction, message.photoId))
  if (photo === undefined || photo.displayKey !== null) return 'nothing_to_do'
  const original = await dependencies.evidence.read(photo.evidenceKey)
  // Faces are found on the smaller copy, which is what Rekognition can take, and blurred on it.
  const small = await displayCopy(original, [])
  const faces = await dependencies.faces.find(small)
  const copy = faces.length === 0 ? small : await displayCopy(small, faces)
  const fingerprint = await perceptualHash(original)
  await dependencies.evidence.putDisplay(photo.evidenceKey, copy)
  const recorded = await inShop(dependencies.database, scope, (transaction) => recordDisplayCopy(transaction, message.photoId, photo.evidenceKey, fingerprint))
  return recorded ? 'made' : 'nothing_to_do'
}
