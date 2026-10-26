import type { Region } from './capture-session.ts'

// reportedWithin: how much of a finding must lie inside a mark reported during the rental to be that same damage.
export const INSPECTION_LIMITS = { minConfidence: 0.9, knownMarkOverlap: 0.5, reportedWithin: 0.8, maxFindings: 8, maxCalls: 10, maxTokensPerCall: 4096, maxMilliseconds: 120_000 } as const
export type InspectionClass = 'new_damage' | 'missing_part' | 'wear' | 'uncertain' | 'known_mark' | 'reported'
export type InspectionFinding = { readonly view: string; readonly region: Region; readonly class: InspectionClass; readonly confidence: number; readonly secondLookConfirmed: boolean | null }

export function regionOverlap(first: Region, second: Region): number {
  const width = Math.max(0, Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x))
  const height = Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y))
  const area = width * height
  return area / (first.width * first.height + second.width * second.height - area)
}

// The share of the first region that lies inside the second.
function shareInside(inner: Region, outer: Region): number {
  const width = Math.max(0, Math.min(inner.x + inner.width, outer.x + outer.width) - Math.max(inner.x, outer.x))
  const height = Math.max(0, Math.min(inner.y + inner.height, outer.y + outer.height) - Math.max(inner.y, outer.y))
  return (width * height) / (inner.width * inner.height)
}

type Mark = { readonly id: string; readonly view: string; readonly region: Region }
// A mark the renter reported during this rental (extensions.md section 10.6). Covered when its incident was agreed as
// small damage or made the shop's matter: then a line already speaks for it, or none may.
type ReportedMark = Mark & { readonly covered: boolean }

// The model suggests observations. Plain code decides uncertainty, excludes marks already on the item, and links
// findings to marks reported during this rental. Reporting does not make a mark old: it is never a known mark here.
export function inspectFindings<Finding extends InspectionFinding>(findings: readonly Finding[], marks: readonly Mark[], reported: readonly ReportedMark[] = []) {
  const checked = findings.map((finding) => {
    const known = marks.find((mark) => mark.view === finding.view && regionOverlap(finding.region, mark.region) >= INSPECTION_LIMITS.knownMarkOverlap)
    if (known !== undefined) return { ...finding, class: 'known_mark' as const, matchedMarkId: known.id }
    const report = reported.find((mark) => mark.view === finding.view && shareInside(finding.region, mark.region) > 0)
    if (report?.covered === true) {
      // Damage that grew beyond what the renter photographed goes to a person; the agreed line covers only the photograph.
      const same = shareInside(finding.region, report.region) >= INSPECTION_LIMITS.reportedWithin
      return { ...finding, class: same ? 'reported' as const : 'uncertain' as const, matchedMarkId: report.id }
    }
    const damage = finding.class === 'new_damage' || finding.class === 'missing_part'
    const uncertain = finding.class === 'uncertain' || finding.confidence < INSPECTION_LIMITS.minConfidence || (damage && finding.secondLookConfirmed !== true)
    return { ...finding, class: uncertain ? 'uncertain' as const : finding.class, matchedMarkId: report?.id ?? null }
  })
  const state = checked.some((finding) => finding.class === 'uncertain') ? 'deferred' as const
    : checked.some((finding) => finding.class === 'new_damage' || finding.class === 'missing_part') ? 'findings' as const : 'clean' as const
  return { state, findings: checked }
}
