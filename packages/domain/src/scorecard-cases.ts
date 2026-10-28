import { isDamage, overlaps } from './evaluation.ts'
import type { EvaluatedCase, EvaluationGroup, GateLimits, Measures, Share } from './evaluation.ts'

// The open scorecard (extensions.md section 5.5): the accepted run read case by case. Each verdict follows the same
// rule as the measure it feeds, so the case grid, the matrix and the published figures always agree.

// pass and fail are the comparison's; a pair sent to a person is neither, as deferring is counted on its own.
export type CaseVerdict = 'pass' | 'fail' | 'person'

export function caseVerdict(pair: EvaluatedCase): CaseVerdict {
  switch (pair.group) {
    case 'clean_easy':
    case 'clean_hard':
    case 'wear':
      return pair.state === 'findings' ? 'fail' : pair.state === 'deferred' ? 'person' : 'pass'
    case 'damage': {
      const found = pair.labels.every((label) => pair.findings.some((finding) => isDamage(finding) && overlaps(finding.region, label.region)))
      return found ? 'pass' : pair.state === 'deferred' ? 'person' : 'fail'
    }
    case 'known_mark':
      return pair.findings.some((finding) => isDamage(finding) && pair.knownMarks.some((mark) => overlaps(finding.region, mark))) ? 'fail' : 'pass'
    case 'identity':
      return pair.state === 'deferred' ? 'pass' : 'fail'
  }
}

// What a pair should have ended in: a clean return or a known mark stays clean, damage ends in findings, and a wrong
// item or a reused photograph goes to a person.
export type PairOutcome = EvaluatedCase['state']
const OUTCOMES: readonly PairOutcome[] = ['clean', 'findings', 'deferred']

export function expectedOutcome(group: EvaluationGroup): PairOutcome {
  if (group === 'damage') return 'findings'
  if (group === 'identity') return 'deferred'
  // A clean return, ordinary wear and a known mark: nothing new to charge.
  return 'clean'
}

export type OutcomeMatrix = Readonly<Record<PairOutcome, Readonly<Record<PairOutcome, number>>>>

// Expected against actual, a count in every cell: the confusion table the scorecard shades.
export function outcomeMatrix(cases: readonly EvaluatedCase[]): OutcomeMatrix {
  const row = (expected: PairOutcome) => Object.fromEntries(OUTCOMES.map((actual) => [actual, cases.filter((pair) => expectedOutcome(pair.group) === expected && pair.state === actual).length])) as Record<PairOutcome, number>
  return { clean: row('clean'), findings: row('findings'), deferred: row('deferred') }
}

export type TrendRun = {
  readonly id: string
  readonly completedAt: Date
  readonly accepted: boolean
  readonly gatePassed: boolean
  readonly pipelineVersion: string
  readonly measures: Measures
  readonly gateLimits: GateLimits | null
}

export type TrendPoint = TrendRun & {
  readonly cleanRate: number
  readonly damageRate: number
  // The most clean returns wrongly flagged this run's gate allowed, as a rate; none before the limits were set.
  readonly cleanLimit: number | null
  // The least damage found it allowed: the run accepted before it, less the drop the limits tolerate.
  readonly damageFloor: number | null
  readonly withinCleanLimit: boolean
  readonly aboveDamageFloor: boolean
}

const rate = (share: Share) => (share.total === 0 ? 0 : share.count / share.total)

// Each run of the gate half, oldest first, with the lines its gate drew, so a worse version shows as a crossed line.
export function runTrend(runs: readonly TrendRun[]): TrendPoint[] {
  let lastAccepted: TrendRun | undefined
  return runs.map((run) => {
    const cleanRate = rate(run.measures.cleanWronglyFlagged)
    const damageRate = rate(run.measures.damageFound)
    const cleanLimit = run.gateLimits?.maxCleanWronglyFlagged ?? null
    const damageFloor = run.gateLimits === null || lastAccepted === undefined ? null : rate(lastAccepted.measures.damageFound) - run.gateLimits.maxDamageFoundDrop
    if (run.accepted) lastAccepted = run
    return { ...run, cleanRate, damageRate, cleanLimit, damageFloor, withinCleanLimit: cleanLimit === null || cleanRate <= cleanLimit, aboveDamageFloor: damageFloor === null || damageRate >= damageFloor }
  })
}
