import type { Region } from './capture-session.ts'
import { regionOverlap } from './inspection.ts'
import type { InspectionClass } from './inspection.ts'

// The groups of the evaluation set (extensions.md section 5.3). Ordinary wear is a clean return: the wear policy
// says it is not damage.
export const EVALUATION_GROUPS = ['clean_easy', 'clean_hard', 'wear', 'damage', 'known_mark', 'identity'] as const
export type EvaluationGroup = (typeof EVALUATION_GROUPS)[number]
const CLEAN_GROUPS: readonly EvaluationGroup[] = ['clean_easy', 'clean_hard', 'wear']

// A finding counts as on a labelled region, or on a known mark, when they overlap at least this much.
export const EVALUATION_OVERLAP = 0.1

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number]

// High is the level the comparison needs before a finding can reach a claim (INSPECTION_LIMITS.minConfidence).
export function confidenceLevel(confidence: number): ConfidenceLevel {
  return confidence >= 0.9 ? 'high' : confidence >= 0.7 ? 'medium' : 'low'
}

export type EvaluatedFinding = { readonly region: Region; readonly class: InspectionClass; readonly confidence: number; readonly secondLookConfirmed: boolean | null }
export type EvaluatedCase = {
  readonly id: string
  readonly group: EvaluationGroup
  // Whether the photographs were taken as they are, or changed by the augmentation tool. Reported, never hidden.
  readonly origin: 'real' | 'synthetic'
  readonly labels: readonly { readonly kind: 'damage' | 'missing'; readonly region: Region }[]
  readonly knownMarks: readonly Region[]
  readonly state: 'clean' | 'findings' | 'deferred'
  readonly findings: readonly EvaluatedFinding[]
  readonly milliseconds: number
  readonly inputTokens: number
  readonly outputTokens: number
}

// A share is always shown with its count: "57 of 60", never a bare percentage.
export type Share = { readonly count: number; readonly total: number }
export type Spread = { readonly median: number; readonly slowestTenth: number }
export type Measures = {
  readonly damageFound: Share
  readonly cleanWronglyFlagged: Share
  readonly sentToPerson: Share
  readonly knownMarksRespected: Share
  readonly looksAgree: Share
  readonly identityCaught: Share
  readonly confidence: Readonly<Record<ConfidenceLevel, Share>>
  readonly milliseconds: Spread
  readonly tokens: Spread
}

const isDamage = (finding: EvaluatedFinding) => finding.class === 'new_damage' || finding.class === 'missing_part'
const overlaps = (first: Region, second: Region) => regionOverlap(first, second) >= EVALUATION_OVERLAP
function share<Item>(items: readonly Item[], counted: (each: Item) => boolean): Share {
  return { count: items.filter(counted).length, total: items.length }
}

function spread(values: readonly number[]): Spread {
  if (values.length === 0) return { median: 0, slowestTenth: 0 }
  const sorted = [...values].sort((first, second) => first - second)
  const middle = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : (sorted[middle] ?? 0)
  // The fastest of the slowest tenth of the runs.
  return { median, slowestTenth: sorted[sorted.length - Math.ceil(sorted.length / 10)] ?? 0 }
}

// Every measure in extensions.md section 5.4, from the pipeline's results and the set's labels. Plain arithmetic.
export function measureEvaluation(cases: readonly EvaluatedCase[]): Measures {
  const labels = cases.flatMap((each) => each.labels.map((label) => ({ label, findings: each.findings })))
  const claimsOfChange = cases.flatMap((each) => each.findings.filter((finding) => isDamage(finding) || finding.class === 'uncertain').map((finding) => ({ finding, correct: each.labels.some((label) => overlaps(finding.region, label.region)) })))
  const firstLookDamage = cases.flatMap((each) => each.findings.filter((finding) => finding.secondLookConfirmed !== null))
  const confidence = Object.fromEntries(CONFIDENCE_LEVELS.map((level) => {
    const atLevel = claimsOfChange.filter((each) => confidenceLevel(each.finding.confidence) === level)
    return [level, { count: atLevel.filter((each) => each.correct).length, total: atLevel.length }]
  })) as Record<ConfidenceLevel, Share>
  return {
    damageFound: share(labels, (each) => each.findings.some((finding) => isDamage(finding) && overlaps(finding.region, each.label.region))),
    cleanWronglyFlagged: share(cases.filter((each) => CLEAN_GROUPS.includes(each.group)), (each) => each.state === 'findings'),
    sentToPerson: share(cases, (each) => each.state === 'deferred'),
    knownMarksRespected: share(cases.filter((each) => each.group === 'known_mark'), (each) => !each.findings.some((finding) => isDamage(finding) && each.knownMarks.some((mark) => overlaps(finding.region, mark)))),
    looksAgree: share(firstLookDamage, (each) => each.secondLookConfirmed === true),
    identityCaught: share(cases.filter((each) => each.group === 'identity'), (each) => each.state === 'deferred'),
    confidence,
    milliseconds: spread(cases.map((each) => each.milliseconds)),
    tokens: spread(cases.map((each) => each.inputTokens + each.outputTokens)),
  }
}

// When none of `total` tries went wrong, the highest rate that result still allows, at 95 percent (Clopper-Pearson).
// Sixty clean pairs with none wrongly flagged supports "below about 6 percent", not "never".
export function zeroUpperBound(total: number): number {
  return total === 0 ? 1 : 1 - 0.025 ** (1 / total)
}

// The whole percent a share is printed with, beside its count, in the report, the README and on every page.
export function sharePercent(share: Share): number {
  return share.total === 0 ? 0 : Math.round((share.count / share.total) * 100)
}

const rate = (each: Share) => (each.total === 0 ? 0 : each.count / each.total)

export type GateLimits = { readonly maxCleanWronglyFlagged: number; readonly maxDamageFoundDrop: number }

// A release that makes the comparison worse does not ship (section 5.6). The limits are set after the first run.
export function checkGate(input: { readonly current: Measures; readonly accepted: Measures | null; readonly limits: GateLimits }): { readonly pass: boolean; readonly reasons: readonly string[] } {
  if (input.accepted === null) return { pass: true, reasons: ['first_run'] }
  const reasons: string[] = []
  if (rate(input.current.cleanWronglyFlagged) > input.limits.maxCleanWronglyFlagged) reasons.push('clean_wrongly_flagged_above_limit')
  if (rate(input.accepted.damageFound) - rate(input.current.damageFound) > input.limits.maxDamageFoundDrop) reasons.push('damage_found_fell')
  return { pass: reasons.length === 0, reasons }
}
