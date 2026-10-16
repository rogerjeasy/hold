import { addDays } from './hold-clocks.ts'

// A capture session: one guided set of photographs of one item (architecture.md section 9). The phone measures each
// photograph; these rules decide what is good enough, what is still missing, and what a sealed session's manifest
// says, so an item's sessions form a chain that cannot be rewritten.

// Who takes each kind and when (architecture.md section 9.1). `condition` holds what a renter photographed after a
// handover that staff missed.
export const CAPTURE_SESSION_KINDS = ['handover', 'return', 'packing', 'unboxing', 'send_back', 'condition'] as const
export type CaptureSessionKind = (typeof CAPTURE_SESSION_KINDS)[number]

// The renter's answer to the condition report.
export const CONDITION_REPLIES = ['confirmed', 'added'] as const
export type ConditionReply = (typeof CONDITION_REPLIES)[number]

// The views a renter may add to a condition session: what staff missed, in no plan.
export const MISSED_VIEWS = ['missed-1', 'missed-2', 'missed-3', 'missed-4', 'missed-5', 'missed-6'] as const

// The required views not yet photographed, in the plan's order.
export function missingViews(plan: readonly { readonly key: string; readonly required: boolean }[], taken: readonly string[]): readonly string[] {
  const have = new Set(taken)
  return plan.filter((view) => view.required && !have.has(view.key)).map((view) => view.key)
}

// What the phone measures on a photograph before it uploads: the variance of its Laplacian on a 640-pixel-wide grey
// copy; how dark its shadows and how bright its highlights are, from 0 to 255, as the grey level below which the
// darkest 5% lie and above which the brightest 5% lie; and how much of the frame the outline of the item fills, from 0
// to 1. Shadows and highlights, not a mean: an item lit against a black or a white backdrop is a good photograph.
export type PhotoMeasures = { readonly sharpness: number; readonly shadows: number; readonly highlights: number; readonly filled: number }

// Starting values, to be tuned on the evaluation set's photographs (architecture.md section 10.8).
export const PHOTO_QUALITY = { minSharpness: 60, minHighlights: 70, maxShadows: 200, minFilled: 0.25 } as const

export type PhotoProblem = 'blurred' | 'too_dark' | 'too_bright' | 'badly_framed'

// Why a photograph should be taken again, if it should. A retake at the counter takes two seconds; a blurred
// handover photograph cannot be fixed afterwards.
export function checkPhotoQuality(measures: PhotoMeasures): readonly PhotoProblem[] {
  const problems: PhotoProblem[] = []
  if (measures.sharpness < PHOTO_QUALITY.minSharpness) problems.push('blurred')
  // Too dark: even the brightest part stays dim. Too bright: even the darkest part is washed out.
  if (measures.highlights < PHOTO_QUALITY.minHighlights) problems.push('too_dark')
  if (measures.shadows > PHOTO_QUALITY.maxShadows) problems.push('too_bright')
  if (measures.filled < PHOTO_QUALITY.minFilled) problems.push('badly_framed')
  return problems
}

// A box on a photograph, as fractions of its width and height, so it survives resizing.
export type Region = { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

// Smaller than this, a box marks nothing a person could see.
const SMALLEST_SIDE = 0.01

export function checkRegion(region: Region): boolean {
  const { x, y, width, height } = region
  return [x, y, width, height].every(Number.isFinite) && x >= 0 && y >= 0 && width >= SMALLEST_SIDE && height >= SMALLEST_SIDE && x + width <= 1 && y + height <= 1
}

export type SealedSession = {
  readonly sessionId: string
  readonly itemId: string
  readonly kind: CaptureSessionKind
  readonly sealedAt: Date
  // The fingerprint of the item's previous sealed manifest, or null for its first session.
  readonly previousManifestFingerprint: string | null
  readonly photos: readonly { readonly view: string; readonly sha256: string; readonly receivedAt: Date }[]
}

// The manifest's exact text, whose SHA-256 is the session's fingerprint. Its keys and photographs are in a fixed
// order, so the same session always gives the same text, and naming the previous manifest chains the item's sessions.
export function manifestText(session: SealedSession): string {
  const photos = [...session.photos]
    .sort((first, second) => (first.view < second.view ? -1 : first.view > second.view ? 1 : 0))
    .map((photo) => ({ view: photo.view, sha256: photo.sha256, receivedAt: photo.receivedAt.toISOString() }))
  return JSON.stringify({ session: session.sessionId, item: session.itemId, kind: session.kind, sealedAt: session.sealedAt.toISOString(), previous: session.previousManifestFingerprint, photos })
}

// The renter has this long after the handover is sealed to confirm the condition report or add what was missed.
export const CONDITION_REPLY_HOURS = 24

export function conditionReplyOpen(sealedAt: Date, now: Date): boolean {
  return now < addDays(sealedAt, CONDITION_REPLY_HOURS / 24)
}
