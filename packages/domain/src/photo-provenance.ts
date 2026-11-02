import type { StaffRole } from './approval.ts'
import { isSamplePhoto } from './capture-session.ts'
import type { CaptureSessionKind } from './capture-session.ts'

// What is said under every evidence photograph (architecture.md section 9.7): when the server received it, who took
// it, how, and its seal. The fingerprint and the server's time are the proof; the source is what Hold's own capture
// screen reported, and the demonstration's samples are known by fingerprint alone.

// What Hold's capture screen may report: the live camera, or a file chosen because there was no camera.
export const DECLARED_PHOTO_SOURCES = ['camera', 'file'] as const
export type DeclaredPhotoSource = (typeof DECLARED_PHOTO_SOURCES)[number]
export const PHOTO_SOURCES = [...DECLARED_PHOTO_SOURCES, 'sample'] as const
export type PhotoSource = (typeof PHOTO_SOURCES)[number]

// Null when the screen did not say, as before sources were kept.
export function photoSource(declared: DeclaredPhotoSource | undefined, sha256: string): PhotoSource | null {
  if (isSamplePhoto(sha256)) return 'sample'
  return declared ?? null
}

export type PhotoTaker = StaffRole | 'renter' | 'staff'

// The renter for anything taken through their link; otherwise the role the staff member holds in the shop, or the
// shop's staff when they hold none any more.
export function photoTakenBy(session: { readonly kind: CaptureSessionKind; readonly byRenter: boolean; readonly actorRole: StaffRole | null }): PhotoTaker {
  if (session.byRenter || session.kind === 'condition' || session.kind === 'incident') return 'renter'
  return session.actorRole ?? 'staff'
}

const SEAL_GROUPS = 4

export function shortSeal(sha256: string): string {
  return Array.from({ length: SEAL_GROUPS }, (_, group) => sha256.slice(group * 4, group * 4 + 4)).join(' ')
}
