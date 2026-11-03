import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { ComparisonScreen } from './comparison-screen'

vi.mock('./actions', () => ({ recordReview: vi.fn(), compareSample: vi.fn() }))
vi.mock('@/hooks/use-look-again', () => ({ useLookAgain: () => undefined }))
const report = { id: 'comparison', rentalId: 'rental', label: 'City e-bike', state: 'clean' as const, model: 'recorded', promptVersion: 'inspection-1', simulated: false, modelAnswered: true, before: [{ view: 'left-side', url: '/before.jpg' }], after: [{ view: 'left-side', url: '/after.jpg' }], findings: [], reviews: [], deferredReason: null, usage: { calls: 2, inputTokens: 9100, outputTokens: 1240 }, waitsForStart: false, viewLabels: { 'left-side': 'Left side' } }

describe('the comparison review screen', () => {
  it.each([['clean', 'Clean'], ['findings', 'Findings'], ['deferred', 'Needs a person']] as const)('shows the %s outcome with human review and no charge control', (state, title) => {
    renderWithIntl(<ComparisonScreen shopName="Ribeira Bikes" report={{ ...report, state }} canAct />)
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /charge|capture|release/i })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Your inspection notes')).toBeInTheDocument()
  })
  // Found in the audit: views headed by their keys ("frame-left", "frame-drive-side").
  it('heads each view with its name in words, never its key, even for a view the plan does not name', () => {
    renderWithIntl(<ComparisonScreen shopName="Ribeira Bikes" report={{ ...report, before: [...report.before, { view: 'frame-drive-side', url: '/before-2.jpg' }], after: [...report.after, { view: 'frame-drive-side', url: '/after-2.jpg' }] }} canAct />)
    expect(screen.getByRole('heading', { name: 'Left side' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Frame drive side' })).toBeInTheDocument()
    expect(screen.queryByText('frame-drive-side')).not.toBeInTheDocument()
  })
  it('shows simulation and preparation explicitly and leaves read-only members no form', () => {
    renderWithIntl(<ComparisonScreen shopName="Ribeira Bikes" report={{ ...report, simulated: true, modelAnswered: false, state: 'pending' }} canAct={false} />)
    expect(screen.getByText('Simulated comparison')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Comparing photographs')
    expect(screen.queryByLabelText('Your inspection notes')).not.toBeInTheDocument()
  })
  it('says plainly that Claude did not answer, not that the photographs are uncertain, and names no model', () => {
    renderWithIntl(<ComparisonScreen shopName="Ribeira Bikes" report={{ ...report, state: 'deferred', deferredReason: 'model_unavailable', model: 'not_called', modelAnswered: false }} canAct />)
    expect(screen.getByRole('heading', { name: 'Needs a person' })).toBeInTheDocument()
    expect(screen.getByText(/Claude did not answer this comparison/)).toBeInTheDocument()
    expect(screen.queryByText(/The photographs or comparison are uncertain/)).not.toBeInTheDocument()
    expect(screen.getByText('Model: Not run. Prompt: inspection-1.')).toBeInTheDocument()
  })
  it('says the photographs are demonstration samples, not that the comparison was simulated, when Claude compared them', () => {
    renderWithIntl(<ComparisonScreen shopName="Ribeira Bikes" report={{ ...report, simulated: true, modelAnswered: true }} canAct />)
    expect(screen.getByText('Demonstration photographs, real comparison')).toBeInTheDocument()
    expect(screen.queryByText('Simulated comparison')).not.toBeInTheDocument()
  })
})

describe('the demo’s sample return, waiting for its comparison', () => {
  const waiting = { ...report, state: 'pending' as const, simulated: true, modelAnswered: false, model: null, promptVersion: null, waitsForStart: true, usage: { calls: 0, inputTokens: 0, outputTokens: 0 } }
  it('offers staff the real comparison instead of saying it is comparing, with the runs left today', () => {
    renderWithIntl(<ComparisonScreen shopName="Ribeira Bikes" report={waiting} canAct sampleAllowance={{ left: 2, refusal: null }} />)
    expect(screen.getByRole('button', { name: 'Run the real comparison on this sample' })).toBeInTheDocument()
    expect(screen.getByText(/2 real comparisons left today from your network/)).toBeInTheDocument()
    expect(screen.getByText(/Claude Opus 4.6 compares these demonstration photographs/)).toBeInTheDocument()
    expect(screen.queryByText(/Comparing photographs/)).not.toBeInTheDocument()
    // Nothing has run yet, so the page does not also say no model answered.
    expect(screen.queryByText('Simulated comparison')).not.toBeInTheDocument()
  })
  it('offers no button once none is left today, and says which share is spent and when it starts again', () => {
    renderWithIntl(<ComparisonScreen shopName="Ribeira Bikes" report={waiting} canAct sampleAllowance={{ left: 0, refusal: 'daily_cap_network' }} />)
    expect(screen.queryByRole('button', { name: 'Run the real comparison on this sample' })).not.toBeInTheDocument()
    expect(screen.getByText('No real comparison left today')).toBeInTheDocument()
    expect(screen.getByText(/Your network has used its real comparisons on samples for today. They start again at midnight UTC/)).toBeInTheDocument()
  })
  it('explains it to a read-only member without the button', () => {
    renderWithIntl(<ComparisonScreen shopName="Ribeira Bikes" report={waiting} canAct={false} sampleAllowance={{ left: 2, refusal: null }} />)
    expect(screen.queryByRole('button', { name: 'Run the real comparison on this sample' })).not.toBeInTheDocument()
    expect(screen.getByText(/Claude Opus 4.6 compares these demonstration photographs/)).toBeInTheDocument()
  })
  it('says the page updates by itself once it is started', () => {
    renderWithIntl(<ComparisonScreen shopName="Ribeira Bikes" report={{ ...waiting, waitsForStart: false, state: 'running' }} canAct />)
    expect(screen.getByRole('status')).toHaveTextContent('This page updates by itself')
    expect(screen.queryByRole('button', { name: 'Run the real comparison on this sample' })).not.toBeInTheDocument()
  })
})

describe('what the comparison shows about itself', () => {
  it('names each view by the shop’s own words, not its key', () => {
    renderWithIntl(<ComparisonScreen shopName="Ribeira Bikes" report={report} canAct />)
    expect(screen.getByRole('heading', { name: 'Left side' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'left-side' })).not.toBeInTheDocument()
  })
  it('says how many calls the model took and the tokens it read and wrote, once it answered', () => {
    renderWithIntl(<ComparisonScreen shopName="Ribeira Bikes" report={report} canAct />)
    expect(screen.getByText('2 model calls, 9,100 tokens read, 1,240 written.')).toBeInTheDocument()
    renderWithIntl(<ComparisonScreen shopName="Ribeira Bikes" report={{ ...report, modelAnswered: false }} canAct />)
    expect(screen.getAllByText(/model calls/)).toHaveLength(1)
  })
  it('says when the independent second look did not confirm a finding', () => {
    const finding = { id: 'f1', view: 'left-side', region: { x: 0.4, y: 0.4, width: 0.1, height: 0.1 }, class: 'new_damage' as const, confidence: 0.95, description: 'A new scratch.', secondLookConfirmed: false, priceDescription: null, amountCents: null, currency: null, reported: null }
    renderWithIntl(<ComparisonScreen shopName="Ribeira Bikes" report={{ ...report, state: 'deferred', findings: [finding] }} canAct />)
    expect(screen.getByText('The independent second look did not confirm it.')).toBeInTheDocument()
  })
})

describe('a finding\'s confidence', () => {
  const finding = { id: 'f1', view: 'left-side', region: { x: 0.4, y: 0.4, width: 0.1, height: 0.1 }, class: 'new_damage' as const, confidence: 0.95, description: 'A new scratch.', secondLookConfirmed: true, priceDescription: null, amountCents: null, currency: null, reported: null }
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

it('labels damage the renter reported and agreed during the rental, and links it to the agreed line (X5.2)', () => {
  const finding = { id: 'finding', view: 'left-side', region: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 }, class: 'reported' as const, confidence: 0.95, description: 'Scratch on the left side', secondLookConfirmed: true, priceDescription: 'Scratch', amountCents: 3500, currency: 'EUR', reported: { incidentId: 'incident', state: 'agreed' as const, agreedCents: 3500, currency: 'EUR' } }
  renderWithIntl(<ComparisonScreen shopName="Ribeira Bikes" report={{ ...report, findings: [finding] }} canAct />)
  expect(screen.getByText('Reported during this rental')).toBeInTheDocument()
  expect(screen.getByText(/The renter reported it during the rental and agreed €35.00\./)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'See the agreed line' })).toHaveAttribute('href', '/shop/rentals/rental/claim')
})

it('shows where a renter left the item on its own, never as a pair with nothing to compare', () => {
  renderWithIntl(<ComparisonScreen shopName="Ribeira Bikes" report={{ ...report, after: [...report.after, { view: 'drop-point', url: '/drop.jpg' }] }} canAct />)
  expect(screen.getByRole('img', { name: 'Where the renter left it' })).toHaveAttribute('src', '/drop.jpg')
  expect(screen.queryByRole('heading', { name: 'drop-point' })).not.toBeInTheDocument()
  expect(screen.queryByText('The display photograph is being prepared.')).not.toBeInTheDocument()
})
