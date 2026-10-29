import { REPLACEMENT_LEAD_DAYS } from '@hold/domain'

// The shapes of the insights dashboard's own widgets (extensions.md section 12.5), as fractions of a bar, so the widgets
// only draw them.

export type LifeSegment = { readonly kind: 'assured' | 'valid' | 'ending'; readonly from: number; readonly to: number }

// A hold's line: the days its capture is assured, then valid, then ending (when upkeep asks for a replacement), with
// today in the middle of its day.
export function lifeSegments({ day, days, assuredDays }: { day: number; days: number; assuredDays: number }): { readonly segments: LifeSegment[]; readonly today: number } {
  const endingFrom = Math.max(assuredDays, days - REPLACEMENT_LEAD_DAYS)
  const at = (count: number) => Math.min(Math.max(count, 0), days) / days
  return {
    segments: [{ kind: 'assured', from: 0, to: at(assuredDays) }, { kind: 'valid', from: at(assuredDays), to: at(endingFrom) }, { kind: 'ending', from: at(endingFrom), to: 1 }],
    today: (Math.min(Math.max(day, 1), days) - 0.5) / days,
  }
}

export type WaterfallStep = { readonly kind: 'reserved' | 'captured' | 'released' | 'held'; readonly cents: number; readonly from: number; readonly to: number }

// From what was reserved, down by what was captured, then by what was released, to what is still held. Captured plus
// released never exceeds reserved; when the records ever said otherwise, the waterfall says so.
export function waterfallSteps({ reservedCents, capturedCents, releasedCents }: { reservedCents: number; capturedCents: number; releasedCents: number }): { readonly steps: WaterfallStep[]; readonly withinHold: boolean } {
  const part = (cents: number) => (reservedCents <= 0 ? 0 : Math.min(Math.max(cents / reservedCents, 0), 1))
  const afterCapture = part(reservedCents - capturedCents)
  const afterRelease = part(reservedCents - capturedCents - releasedCents)
  const heldCents = Math.max(0, reservedCents - capturedCents - releasedCents)
  return {
    steps: [
      { kind: 'reserved', cents: reservedCents, from: 0, to: part(reservedCents) },
      { kind: 'captured', cents: capturedCents, from: afterCapture, to: part(reservedCents) },
      { kind: 'released', cents: releasedCents, from: afterRelease, to: afterCapture },
      { kind: 'held', cents: heldCents, from: 0, to: afterRelease },
    ],
    withinHold: capturedCents + releasedCents <= reservedCents,
  }
}
