import { measureEvaluation } from '@hold/domain'
import type { EvaluatedCase } from '@hold/domain'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { ReliabilityScreen } from './reliability-screen'

vi.mock('@/features/open-scorecard/case-grid', () => ({ CaseGrid: () => <p>Grid stand-in</p> }))

const pair: EvaluatedCase = { id: 'clean-1', group: 'clean_easy', origin: 'real', view: 'frame-left', before: 'gate/b.jpg', after: 'gate/a.jpg', alignment: 0.9, labels: [], knownMarks: [], state: 'clean', findings: [], milliseconds: 4000, inputTokens: 3000, outputTokens: 300 }
const measures = measureEvaluation([pair])
const run = { completedAt: new Date('2026-11-02T10:00:00Z'), caseCount: 1, syntheticCount: 0, pipelineVersion: 'inspection-2+a1', model: 'claude', measures, realMeasures: measures }

// The public scorecard: the published figures, then every pair they were counted from, for anyone to check.
describe('the public scorecard', () => {
  it('shows the figures and, below them, every pair of the accepted run, case by case', () => {
    renderWithIntl(<ReliabilityScreen run={run} cases={[pair]} history={[]} />)
    expect(screen.getByRole('heading', { name: 'Every pair, case by case' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Does confidence hold up?' })).toBeInTheDocument()
  })

  it('claims nothing and shows no pair before a run is accepted', () => {
    renderWithIntl(<ReliabilityScreen run={undefined} cases={[]} history={[]} />)
    expect(screen.getByText('Not measured yet')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Every pair, case by case' })).not.toBeInTheDocument()
  })
})
