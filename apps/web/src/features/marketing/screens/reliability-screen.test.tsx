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

  it('says which accepted run was withdrawn and why, and that the pairs were refreshed, instead of showing it', () => {
    const withdrawn = { completedAt: new Date('2026-10-29T14:35:00Z'), withdrawnAt: new Date('2026-11-03T09:00:00Z'), reason: 'model_not_asked' as const }
    renderWithIntl(<ReliabilityScreen run={undefined} cases={[]} history={[]} withdrawn={withdrawn} />)
    expect(screen.getByText('Not measured yet')).toBeInTheDocument()
    expect(screen.getByText('The run accepted on Oct 29, 2026 was withdrawn on Nov 3, 2026. Claude answered too few of its pairs for it to measure the comparison: most never got past the alignment step.')).toBeInTheDocument()
    expect(screen.getByText(/the gate half was rebuilt with new pairs/)).toBeInTheDocument()
    expect(screen.queryByText(/ of 42/)).not.toBeInTheDocument()
  })
})
