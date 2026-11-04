import { CONFIDENCE_LEVELS, EVALUATION_GROUPS, sharePercent, zeroUpperBound } from '@hold/domain'
import type { EvaluatedCase, EvaluationGroup, GateResult, Measures, Share } from '@hold/domain'
import { SET_TARGETS } from './manifest.ts'

export type RunRecord = {
  readonly half: 'tuning' | 'gate'
  readonly dataSetVersion: string
  readonly pipelineVersion: string
  readonly model: string
  readonly completedAt: Date
  readonly gate: GateResult
  readonly cases: readonly EvaluatedCase[]
  readonly measures: Measures
  readonly realMeasures: Measures
  // Present when only some groups were run, which measures nothing.
  readonly groups?: readonly EvaluationGroup[]
}

// What code found on the pair and what became of it; older runs did not record it.
function codeAreasText(areas: EvaluatedCase['codeAreas']): string {
  if (areas === undefined) return 'not recorded'
  if (areas === null) return 'not compared'
  return `${String(areas.found)} found, ${String(areas.dismissed)} dismissed, ${String(areas.unaccounted)} left to a person`
}

const percent = (fraction: number) => `${String(Math.round(fraction * 100))}%`

// A share is always its count. Where a count of zero is the good outcome, the text says how far it can be trusted.
export function shareText(share: Share, options: { readonly zeroIsGood?: boolean } = {}): string {
  const counted = `${String(share.count)} of ${String(share.total)}`
  if (share.total === 0) return `${counted} (not measured)`
  if (share.count === 0 && options.zeroIsGood === true) return `${counted} (below about ${percent(zeroUpperBound(share.total))} at 95% confidence, not "never")`
  return `${counted} (${String(sharePercent(share))}%)`
}

const seconds = (milliseconds: number) => `${(milliseconds / 1000).toFixed(1)} s`

// The measures of extensions.md section 5.4, in the order the scorecard shows them.
function rows(measures: Measures): readonly (readonly [string, string])[] {
  return [
    ['Damage found', shareText(measures.damageFound)],
    ['Damage passed as clean', measures.damagePassedAsClean === undefined ? 'not recorded in this run' : shareText(measures.damagePassedAsClean, { zeroIsGood: true })],
    ['Clean returns wrongly flagged', shareText(measures.cleanWronglyFlagged, { zeroIsGood: true })],
    ['Sent to a person', shareText(measures.sentToPerson)],
    ['Known marks respected', shareText(measures.knownMarksRespected)],
    ['Agreement between the two looks', shareText(measures.looksAgree)],
    ['Wrong item or reused photograph caught', shareText(measures.identityCaught)],
    ...CONFIDENCE_LEVELS.map((level) => [`Confidence holds up: ${level}`, shareText(measures.confidence[level])] as const),
    ['Time for one comparison', `median ${seconds(measures.milliseconds.median)}, slowest tenth ${seconds(measures.milliseconds.slowestTenth)}`],
    ['Tokens for one comparison', `median ${String(measures.tokens.median)}, slowest tenth ${String(measures.tokens.slowestTenth)}`],
  ]
}

function provenance(run: RunRecord): string {
  const synthetic = run.cases.filter((each) => each.origin === 'synthetic').length
  return `${String(run.cases.length)} pairs (${String(run.cases.length - synthetic)} real, ${String(synthetic)} synthetic), ${run.half} half, data set ${run.dataSetVersion.slice(0, 12)}, pipeline ${run.pipelineVersion}, model ${run.model}, ${run.completedAt.toISOString().slice(0, 10)}`
}

// The table the README carries between its scorecard markers. It is rendered from the same run as the report.
export function readmeTable(run: RunRecord): string {
  const real = new Map(rows(run.realMeasures))
  return [
    `Measured on ${provenance(run)}.`,
    '',
    '| Measure | All pairs | Photographs taken as they are |',
    '|---|---|---|',
    ...rows(run.measures).map(([name, value]) => `| ${name} | ${value} | ${real.get(name) ?? ''} |`),
  ].join('\n')
}

// A first run has nothing to be worse than: it is reported as such, never as a pass.
function gateLine(gate: GateResult): string {
  if (gate.outcome === 'no_baseline') return 'Gate: no accepted run to compare against. This run measures the comparison; it proves nothing against a baseline until a person accepts one.'
  if (gate.outcome === 'passed') return 'Gate: passed against the accepted run.'
  return `Gate: failed (${gate.reasons.join(', ')}).`
}

export function renderReport(run: RunRecord): string {
  const counts = EVALUATION_GROUPS.map((group) => `| ${group} | ${String(run.cases.filter((each) => each.group === group).length)} | ${String(SET_TARGETS[group])} |`)
  const caseRows = run.cases.map((each) => `| ${each.id} | ${each.group} | ${each.origin} | ${each.state} | ${String(each.findings.length)} | ${codeAreasText(each.codeAreas)} |`)
  return [
    `# Comparison evaluation, ${run.half} half`,
    '',
    gateLine(run.gate),
    '',
    ...(run.groups === undefined ? [] : [`Only these groups were run: ${run.groups.join(', ')}. This run measures nothing and is never recorded or accepted.`, '']),
    readmeTable(run),
    '',
    '## Pairs per group',
    '',
    '| Group | Pairs | Target |',
    '|---|---|---|',
    ...counts,
    '',
    '## Every pair',
    '',
    '| Case | Group | Origin | Result | Findings | Code areas |',
    '|---|---|---|---|---|---|',
    ...caseRows,
    '',
  ].join('\n')
}
