import { measureEvaluation } from '@hold/domain'
import type { Measures } from '@hold/domain'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { ScorecardScreen } from './scorecard-screen'

const measures: Measures = { ...measureEvaluation([]), damageFound: { count: 34, total: 40 }, damagePassedAsClean: { count: 2, total: 40 }, cleanWronglyFlagged: { count: 0, total: 60 }, sentToPerson: { count: 12, total: 145 } }
const run = { completedAt: new Date('2026-10-29T10:00:00Z'), caseCount: 145, syntheticCount: 120, pipelineVersion: 'inspection-1+abc123def456', model: 'anthropic.claude-opus-5-5', measures, realMeasures: { ...measures, damageFound: { count: 3, total: 4 } } }

describe('how reliable the comparison is, for the owner', () => {
  it('shows every figure with its count, for all pairs and for the photographs taken as they are', () => {
    renderWithIntl(<ScorecardScreen shopName="Ribeira Bikes" run={run} months={[]} />)
    expect(screen.getByText('34 of 40 (85%)')).toBeInTheDocument()
    expect(screen.getByText('3 of 4 (75%)')).toBeInTheDocument()
    expect(screen.getAllByText('0 of 60: below about 6% at 95% confidence, not “never”')).toHaveLength(2)
    expect(screen.getByText(/145 pairs, 25 taken as they are and 120 changed by our augmentation tool/)).toBeInTheDocument()
  })

  it('shows damage the comparison passed as clean beside damage it found, and says when a run did not record it', () => {
    const older = Object.fromEntries(Object.entries(measures).filter(([key]) => key !== 'damagePassedAsClean')) as Measures
    renderWithIntl(<ScorecardScreen shopName="Ribeira Bikes" run={{ ...run, realMeasures: older }} months={[]} />)
    expect(screen.getByText('Damage passed as clean')).toBeInTheDocument()
    expect(screen.getByText('2 of 40 (5%)')).toBeInTheDocument()
    expect(screen.getByText('Not recorded in this run')).toBeInTheDocument()
  })

  it('leads to every pair of the run, case by case, on the public page', () => {
    renderWithIntl(<ScorecardScreen shopName="Ribeira Bikes" run={run} months={[]} />)
    expect(screen.getByRole('link', { name: 'Every pair, case by case' })).toHaveAttribute('href', '/reliability')
  })

  it('claims no accuracy before a run is accepted', () => {
    renderWithIntl(<ScorecardScreen shopName="Ribeira Bikes" run={undefined} months={[]} />)
    expect(screen.getByText('Not measured yet')).toBeInTheDocument()
    expect(screen.queryByText(/ of /)).not.toBeInTheDocument()
  })

  it('warns when people in the shop start removing far more findings than before', () => {
    renderWithIntl(<ScorecardScreen shopName="Ribeira Bikes" run={run} months={[{ month: '2026-09', removed: 1, total: 20 }, { month: '2026-10', removed: 8, total: 16 }]} />)
    expect(screen.getByText('People are removing more findings than before')).toBeInTheDocument()
    expect(screen.getByText('8 of 16 findings removed by a person')).toBeInTheDocument()
  })
})
