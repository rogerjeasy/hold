import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { ComparisonScreen } from './comparison-screen'

vi.mock('./actions', () => ({ recordReview: vi.fn() }))
vi.mock('@/hooks/use-look-again', () => ({ useLookAgain: () => undefined }))
const report = { id: 'comparison', rentalId: 'rental', label: 'City e-bike', state: 'clean' as const, model: 'recorded', promptVersion: 'inspection-1', simulated: false, before: [{ view: 'left-side', url: '/before.jpg' }], after: [{ view: 'left-side', url: '/after.jpg' }], findings: [], reviews: [], deferredReason: null }

describe('the comparison review screen', () => {
  it.each([['clean', 'Clean'], ['findings', 'Findings'], ['deferred', 'Needs a person']] as const)('shows the %s outcome with human review and no charge control', (state, title) => {
    renderWithIntl(<ComparisonScreen shopName="Ribeira Bikes" report={{ ...report, state }} canAct />)
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /charge|capture|release/i })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Your inspection notes')).toBeInTheDocument()
  })
  it('shows simulation and preparation explicitly and leaves read-only members no form', () => {
    renderWithIntl(<ComparisonScreen shopName="Ribeira Bikes" report={{ ...report, simulated: true, state: 'pending' }} canAct={false} />)
    expect(screen.getByText('Simulated comparison')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Comparing photographs')
    expect(screen.queryByLabelText('Your inspection notes')).not.toBeInTheDocument()
  })
})

describe('a finding\'s confidence', () => {
  const finding = { id: 'f1', view: 'left-side', region: { x: 0.4, y: 0.4, width: 0.1, height: 0.1 }, class: 'new_damage' as const, confidence: 0.95, description: 'A new scratch.', secondLookConfirmed: true, priceDescription: null, amountCents: null, currency: null }
  const calibration = { high: { count: 34, total: 36 }, medium: { count: 0, total: 0 }, low: { count: 1, total: 4 } }

  it('says how often findings at its level were correct in testing', () => {
    renderWithIntl(<ComparisonScreen shopName="Ribeira Bikes" report={{ ...report, state: 'findings', findings: [finding] }} canAct calibration={calibration} />)
    expect(screen.getByText('Confidence high. In testing, findings at this level were correct 34 of 36.')).toBeInTheDocument()
  })

  it('says plainly when its level has not been measured', () => {
    renderWithIntl(<ComparisonScreen shopName="Ribeira Bikes" report={{ ...report, state: 'deferred', findings: [{ ...finding, class: 'uncertain', confidence: 0.8 }] }} canAct calibration={calibration} />)
    expect(screen.getByText('Confidence medium. Not measured at this level yet.')).toBeInTheDocument()
  })
})
