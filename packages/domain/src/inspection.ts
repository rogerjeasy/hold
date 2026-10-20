import type { Region } from './capture-session.ts'

export const INSPECTION_LIMITS = { minConfidence: 0.9, knownMarkOverlap: 0.5, maxFindings: 8, maxCalls: 10, maxTokensPerCall: 4096, maxMilliseconds: 120_000 } as const
export type InspectionClass = 'new_damage' | 'missing_part' | 'wear' | 'uncertain' | 'known_mark'
export type InspectionFinding = { readonly view: string; readonly region: Region; readonly class: InspectionClass; readonly confidence: number; readonly secondLookConfirmed: boolean | null }

export function regionOverlap(first: Region, second: Region): number {
  const width = Math.max(0, Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x))
  const height = Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y))
  const area = width * height
  return area / (first.width * first.height + second.width * second.height - area)
}

// The model suggests observations. Plain code decides uncertainty and excludes marks already on the item.
export function inspectFindings<Finding extends InspectionFinding>(findings: readonly Finding[], marks: readonly { readonly id: string; readonly view: string; readonly region: Region }[]) {
  const checked = findings.map((finding) => {
    const known = marks.find((mark) => mark.view === finding.view && regionOverlap(finding.region, mark.region) >= INSPECTION_LIMITS.knownMarkOverlap)
    if (known !== undefined) return { ...finding, class: 'known_mark' as const, matchedMarkId: known.id }
    const damage = finding.class === 'new_damage' || finding.class === 'missing_part'
    const uncertain = finding.class === 'uncertain' || finding.confidence < INSPECTION_LIMITS.minConfidence || (damage && finding.secondLookConfirmed !== true)
    return { ...finding, class: uncertain ? 'uncertain' as const : finding.class, matchedMarkId: null }
  })
  const state = checked.some((finding) => finding.class === 'uncertain') ? 'deferred' as const
    : checked.some((finding) => finding.class === 'new_damage' || finding.class === 'missing_part') ? 'findings' as const : 'clean' as const
  return { state, findings: checked }
}
