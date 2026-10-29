import { checkRegion } from './capture-session.ts'
import type { Region } from './capture-session.ts'

// reportedOverlap: how far a finding and a mark reported during the rental must cover each other (intersection over
// union) to be the same damage. maxReportedArea: the largest share of a view a renter's box may cover, so a report can
// never be drawn around more than the damage it shows.
// secondLookMinConfidence: the independent second look confirms the first look's damage by naming the same class at
// this confidence or more. Shown only two close crops, it agreed at 0.6 to 0.65 on the evaluation set's tuning half
// (29 October 2026), never at the 0.9 a first look needs. A person still approves every charge.
export const INSPECTION_LIMITS = { minConfidence: 0.9, secondLookMinConfidence: 0.6, knownMarkOverlap: 0.5, reportedOverlap: 0.5, maxReportedArea: 0.1, maxFindings: 8, maxCalls: 10, maxTokensPerCall: 4096, maxMillisecondsPerCall: 60_000, maxMilliseconds: 120_000 } as const
export type InspectionClass = 'new_damage' | 'missing_part' | 'wear' | 'uncertain' | 'known_mark' | 'reported'
export type InspectionFinding = { readonly view: string; readonly region: Region; readonly class: InspectionClass; readonly confidence: number; readonly secondLookConfirmed: boolean | null }

export function regionOverlap(first: Region, second: Region): number {
  const width = Math.max(0, Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x))
  const height = Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y))
  const area = width * height
  return area / (first.width * first.height + second.width * second.height - area)
}

// Code finds the candidate areas, and the model may not pass over one. Each is accounted for by a finding that touches
// it, of any class, or by the model dismissing its index with a reason. The rest go to a person.
export function unaccountedCandidates(candidates: readonly Region[], findings: readonly { readonly region: Region }[], dismissed: readonly number[]): readonly Region[] {
  return candidates.filter((candidate, index) => !dismissed.includes(index) && !findings.some((finding) => regionOverlap(candidate, finding.region) > 0))
}

// A box a renter draws on their incident photograph: on the photograph, and no larger than the cap.
export function checkReportedRegion(region: Region): boolean {
  return checkRegion(region) && region.width * region.height <= INSPECTION_LIMITS.maxReportedArea
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
    const report = reported.find((mark) => mark.view === finding.view && regionOverlap(finding.region, mark.region) > 0)
    if (report?.covered === true) {
      // Only the same damage, matched both ways in a box within the cap, is the reported one. Damage that grew, moved or
      // sits inside a larger box goes to a person: the agreed line covers only what was photographed.
      const same = checkReportedRegion(report.region) && regionOverlap(finding.region, report.region) >= INSPECTION_LIMITS.reportedOverlap
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
