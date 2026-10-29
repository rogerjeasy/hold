import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { ContestSummaryPanel } from './contest-summary-panel'
import type { ContestView } from './contest-summary-panel'

vi.mock('@/features/claims/actions', () => ({ rewriteContestSummary: vi.fn() }))

const lines: ContestView['lines'] = [
  { id: 'scratch', description: 'Scratch on the frame, through the paint', source: 'finding', findingDescription: 'A chip in the paint.', bothLooksConfirmed: true, knownMarkNearby: true, addedBy: null, reason: 'A chip in the paint.' },
  { id: 'light', description: 'Lost front light', source: 'person', findingDescription: null, bothLooksConfirmed: false, knownMarkNearby: false, addedBy: 'Jonas', reason: 'The light was missing at the return.' },
]
const shopVersion = {
  overview: 'The renter disputes the scratch on the frame and says it was there at pickup. The lost front light is not disputed.',
  lines: [
    { lineId: 'scratch', disputed: true, shopSays: 'The comparison found a new scratch, and a second look confirmed it.', renterSays: 'She says the damage was there before her rental.', renterQuote: 'It was already there when I picked it up.' },
    { lineId: 'light', disputed: false, shopSays: 'Added by staff with a written reason. The reply does not mention it.', renterSays: null, renterQuote: null },
  ],
}
const view: ContestView = {
  outcome: 'answered',
  simulated: false,
  version: shopVersion,
  comment: 'It was already there when I picked it up.',
  lines,
  rental: { conditionReply: 'confirmed', conditionRepliedAt: new Date('2026-11-01T09:14:00Z'), renterPhotos: 0, incidentsReported: 0 },
}
const show = (overrides: Partial<ContestView> = {}, audience: 'shop' | 'renter' = 'shop', canRewrite = false) =>
  renderWithIntl(<ContestSummaryPanel view={{ ...view, ...overrides }} audience={audience} timeZone="Europe/Lisbon" rentalId="rental" canRewrite={canRewrite} photos={{ scratch: { before: '/before.jpg', after: '/after.jpg', region: { x: 0.3, y: 0.3, width: 0.1, height: 0.1 } } }} />)

describe('the neutral summary of a contest', () => {
  it('says what is disputed in plain words, counts it by code, and says whose words they are', () => {
    show()
    const panel = screen.getByRole('region', { name: 'Where the two sides differ' })
    expect(within(panel).getByText(shopVersion.overview)).toBeInTheDocument()
    expect(within(panel).getByText('Disputed: 1 of 2 lines')).toBeInTheDocument()
    expect(within(panel).getByText('Written by Claude')).toBeInTheDocument()
    expect(within(panel).getByText(/Takes no side and names no amount\./)).toBeInTheDocument()
  })

  it('sets each side of a disputed line next to the other, quoting the renter, with what the records show', () => {
    show()
    const scratch = screen.getByRole('heading', { name: 'Scratch on the frame, through the paint' }).closest('li')
    if (scratch === null) throw new Error('No line.')
    expect(within(scratch).getByText('Disputed')).toBeInTheDocument()
    expect(within(scratch).getByText('The shop says')).toBeInTheDocument()
    expect(within(scratch).getByText('“It was already there when I picked it up.”')).toBeInTheDocument()
    expect(within(scratch).getByText('A mark recorded before this rental is near the same spot.')).toBeInTheDocument()
    expect(within(scratch).getByText('Found by the comparison, and confirmed by an independent second look.')).toBeInTheDocument()
    expect(within(scratch).getByText('Nothing was reported during the rental.')).toBeInTheDocument()
    expect(within(scratch).getByRole('img', { name: 'Return photograph: Scratch on the frame, through the paint' })).toBeInTheDocument()
    const light = screen.getByRole('heading', { name: 'Lost front light' }).closest('li')
    if (light === null) throw new Error('No line.')
    expect(within(light).getByText('Not disputed')).toBeInTheDocument()
  })

  it('speaks to the renter as you, with the same facts', () => {
    show({ version: { ...shopVersion, overview: 'You dispute the scratch on the frame.' } }, 'renter')
    expect(screen.getByText('You dispute the scratch on the frame.')).toBeInTheDocument()
    expect(screen.getByText('You said')).toBeInTheDocument()
  })

  it('still shows the renter’s words and the records when no summary could be written, and lets a decider ask again', () => {
    show({ outcome: 'unavailable', version: null }, 'shop', true)
    expect(screen.getByText(/The summary could not be written this time\./)).toBeInTheDocument()
    expect(screen.getByText('It was already there when I picked it up.')).toBeInTheDocument()
    expect(screen.queryByText('Written by Claude')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Write the summary again' })).toBeInTheDocument()
    expect(screen.getAllByText('Nothing was reported during the rental.')).toHaveLength(2)
  })

  it('says plainly when the summary is a simulation', () => {
    show({ simulated: true })
    expect(screen.getByText('Simulated summary')).toBeInTheDocument()
  })
})
