import type { Region } from './capture-session.ts'
import { INSPECTION_LIMITS } from './inspection.ts'
import { NEGOTIATION_LIMITS } from './negotiation.ts'
import type { Ground, NegotiationSide } from './negotiation.ts'

// What code knows about one claim line, read from this rental's records, for checking grounds (extensions.md 9.6).
export type LineFacts = {
  readonly lineId: string
  readonly publishedCents: number
  // Marks on the finding's view, first seen before this rental, within the referee's distance of its region.
  readonly knownMarks: readonly string[]
  // The finding's confidence is below the highest level, its photographs aligned poorly, or the second look doubted it.
  readonly uncertain: boolean
  readonly bothLooksConfirmed: boolean
  // The clauses of the wear policy the renter agreed to.
  readonly wearClauses: readonly string[]
}

// What holds for the whole claim: the renter's own photographs, and whether the shop's mandate allows goodwill.
export type ClaimFacts = { readonly renterPhotoIds: readonly string[]; readonly goodwillAllowed: boolean }

type Finding = { readonly view: string; readonly region: Region; readonly confidence: number; readonly secondLookConfirmed: boolean | null; readonly alignment: number | null }
type Mark = { readonly id: string; readonly view: string; readonly region: Region; readonly seenBeforeRental: boolean }

// The gap between two boxes, zero where they touch or overlap.
function gap(first: Region, second: Region): number {
  const across = Math.max(0, Math.max(first.x, second.x) - Math.min(first.x + first.width, second.x + second.width))
  const down = Math.max(0, Math.max(first.y, second.y) - Math.min(first.y + first.height, second.y + second.height))
  return Math.hypot(across, down)
}

// One clause per written line of the wear policy, numbered as the transcript cites them.
export function wearClauses(rules: string): { readonly id: string; readonly text: string }[] {
  return rules.split('\n').map((line) => line.trim()).filter((line) => line !== '').map((text, index) => ({ id: `wear-${String(index + 1)}`, text }))
}

// A line a person added by hand has no finding: its photographs neither stand nor are in doubt.
export function lineFacts(input: { readonly lineId: string; readonly publishedCents: number; readonly finding: Finding | null; readonly marks: readonly Mark[]; readonly wearRules: string }): LineFacts {
  const { finding } = input
  const knownMarks = finding === null ? [] : input.marks.filter((mark) => mark.seenBeforeRental && mark.view === finding.view && gap(mark.region, finding.region) <= NEGOTIATION_LIMITS.knownMarkDistance).map((mark) => mark.id)
  const uncertain = finding !== null && (finding.confidence < INSPECTION_LIMITS.minConfidence || finding.alignment === null || finding.alignment < NEGOTIATION_LIMITS.goodAlignment || finding.secondLookConfirmed !== true)
  return { lineId: input.lineId, publishedCents: input.publishedCents, knownMarks, uncertain, bothLooksConfirmed: finding?.secondLookConfirmed === true, wearClauses: wearClauses(input.wearRules).map((clause) => clause.id) }
}

export type GroundRefusal = 'ground_check_failed' | 'ground_not_for_side' | 'goodwill_not_allowed'

// Whether a cited ground holds. A ground the other side alone may use is refused without looking further, so a side
// never learns anything about the other's mandate by trying.
export function checkGround(cited: { readonly side: NegotiationSide; readonly ground: Ground; readonly evidence: readonly string[] }, facts: LineFacts, claim: ClaimFacts): { readonly ok: true } | { readonly ok: false; readonly reason: GroundRefusal } {
  const holds = (passed: boolean) => passed ? { ok: true } as const : { ok: false, reason: 'ground_check_failed' } as const
  switch (cited.ground) {
    case 'known_mark':
      return holds(cited.evidence.length > 0 && cited.evidence.every((id) => facts.knownMarks.includes(id)))
    case 'ordinary_wear':
      return holds(cited.evidence.length > 0 && cited.evidence.every((id) => facts.wearClauses.includes(id)))
    case 'uncertain_evidence':
      return holds(facts.uncertain)
    case 'renter_photo':
      return holds(cited.evidence.length > 0 && cited.evidence.every((id) => claim.renterPhotoIds.includes(id)))
    case 'evidence_stands':
      // Both looks confirmed it, nothing about it is in doubt, and no earlier mark lies near it.
      return cited.side === 'shop' ? holds(facts.bothLooksConfirmed && !facts.uncertain && facts.knownMarks.length === 0) : { ok: false, reason: 'ground_not_for_side' }
    case 'goodwill':
      if (cited.side !== 'shop') return { ok: false, reason: 'ground_not_for_side' }
      return claim.goodwillAllowed ? { ok: true } : { ok: false, reason: 'goodwill_not_allowed' }
  }
}
