import { measureEvaluation } from '@hold/domain'
import type { EvaluatedCase } from '@hold/domain'
import { describe, expect, it } from 'vitest'
import { readmeTable, renderReport, shareText } from './report.ts'

const pair = (overrides: Partial<EvaluatedCase>): EvaluatedCase => ({ id: 'case', group: 'clean_easy', origin: 'real', view: 'frame', before: 'gate/b.jpg', after: 'gate/a.jpg', alignment: 0.9, labels: [], knownMarks: [], state: 'clean', findings: [], milliseconds: 2000, inputTokens: 900, outputTokens: 100, ...overrides })
const run = { half: 'gate' as const, dataSetVersion: 'a'.repeat(64), pipelineVersion: 'inspection-1+abc123', model: 'anthropic.claude-opus-5-5', completedAt: new Date('2026-10-28T10:00:00Z'), gate: { pass: true, reasons: ['first_run'] } }

describe('the run report', () => {
  it('prints a share with its count, never a bare percentage', () => {
    expect(shareText({ count: 57, total: 60 })).toBe('57 of 60 (95%)')
  })

  it('says what a count of zero can and cannot support', () => {
    expect(shareText({ count: 0, total: 60 }, { zeroIsGood: true })).toBe('0 of 60 (below about 6% at 95% confidence, not "never")')
    expect(shareText({ count: 0, total: 0 })).toBe('0 of 0 (not measured)')
  })

  it('lists every measure with its counts, for all pairs and for the photographs taken as they are', () => {
    const cases = [pair({ id: 'r1' }), pair({ id: 's1', origin: 'synthetic', state: 'findings' })]
    const report = renderReport({ ...run, cases, measures: measureEvaluation(cases), realMeasures: measureEvaluation(cases.filter((each) => each.origin === 'real')) })
    for (const heading of ['Damage found', 'Damage passed as clean', 'Clean returns wrongly flagged', 'Sent to a person', 'Known marks respected', 'Agreement between the two looks', 'Wrong item or reused photograph caught', 'Confidence holds up', 'Time for one comparison', 'Tokens for one comparison']) expect(report).toContain(heading)
    expect(report).toContain('| Clean returns wrongly flagged | 1 of 2 (50%) | 0 of 1 (below about 98% at 95% confidence, not "never") |')
    expect(report).toContain('1 synthetic')
  })

  it('says a run recorded before damage passed as clean was measured did not record it', () => {
    const cases = [pair({ id: 'r1' })]
    const older = Object.fromEntries(Object.entries(measureEvaluation(cases)).filter(([key]) => key !== 'damagePassedAsClean')) as ReturnType<typeof measureEvaluation>
    expect(renderReport({ ...run, cases, measures: older, realMeasures: older })).toContain('| Damage passed as clean | not recorded in this run | not recorded in this run |')
  })

  it('renders the same figures for the README table', () => {
    const cases = [pair({ id: 'r1' })]
    const table = readmeTable({ ...run, cases, measures: measureEvaluation(cases), realMeasures: measureEvaluation(cases) })
    expect(table).toContain('| Clean returns wrongly flagged | 0 of 1')
    expect(table).toContain('inspection-1+abc123')
  })
})
