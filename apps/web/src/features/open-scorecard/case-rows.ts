import { caseVerdict, confidenceLevel, expectedOutcome } from '@hold/domain'
import type { CaseVerdict, ConfidenceLevel, EvaluatedCase, EvaluatedFinding, PairOutcome } from '@hold/domain'

// The open scorecard's rows (extensions.md section 5.5): each pair of the accepted run with what it should have ended
// in, what it did, the verdict, and the one finding the row speaks of. The rules are the domain's, so the grid agrees
// with the published figures.

export type SecondLook = 'confirmed' | 'not_confirmed' | 'not_asked'

export type CaseRow = EvaluatedCase & {
  readonly expected: PairOutcome
  readonly actual: PairOutcome
  readonly verdict: CaseVerdict
  // The most confident change the comparison claimed: damage, a missing part, or a doubt. Wear and known marks are not.
  readonly lead: EvaluatedFinding | null
  readonly level: ConfidenceLevel | null
  readonly secondLook: SecondLook
}

const CLAIMED: readonly EvaluatedFinding['class'][] = ['new_damage', 'missing_part', 'uncertain']

function leadOf(findings: readonly EvaluatedFinding[]): EvaluatedFinding | null {
  return findings.filter((finding) => CLAIMED.includes(finding.class)).reduce<EvaluatedFinding | null>((best, finding) => (best === null || finding.confidence > best.confidence ? finding : best), null)
}

export function caseRows(cases: readonly EvaluatedCase[]): CaseRow[] {
  return cases.map((pair) => {
    const lead = leadOf(pair.findings)
    const secondLook: SecondLook = lead?.secondLookConfirmed === true ? 'confirmed' : lead?.secondLookConfirmed === false ? 'not_confirmed' : 'not_asked'
    return { ...pair, expected: expectedOutcome(pair.group), actual: pair.state, verdict: caseVerdict(pair), lead, level: lead === null ? null : confidenceLevel(lead.confidence), secondLook }
  })
}

export type VerdictCounts = { readonly pass: number; readonly fail: number; readonly person: number; readonly total: number }

export function verdictCounts(rows: readonly CaseRow[]): VerdictCounts {
  const count = (verdict: CaseVerdict) => rows.filter((row) => row.verdict === verdict).length
  return { pass: count('pass'), fail: count('fail'), person: count('person'), total: rows.length }
}
