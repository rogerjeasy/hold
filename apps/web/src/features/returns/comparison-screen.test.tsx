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

it('labels damage the renter reported and agreed during the rental, and links it to the agreed line (X5.2)', () => {
  const finding = { id: 'finding', view: 'left-side', region: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 }, class: 'reported' as const, confidence: 0.95, description: 'Scratch on the left side', secondLookConfirmed: true, priceDescription: 'Scratch', amountCents: 3500, currency: 'EUR', reported: { incidentId: 'incident', state: 'agreed' as const, agreedCents: 3500, currency: 'EUR' } }
  renderWithIntl(<ComparisonScreen shopName="Ribeira Bikes" report={{ ...report, findings: [finding] }} canAct />)
  expect(screen.getByText('Reported during this rental')).toBeInTheDocument()
  expect(screen.getByText(/The renter reported it during the rental and agreed €35.00\./)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'See the agreed line' })).toHaveAttribute('href', '/shop/rentals/rental/claim')
})
