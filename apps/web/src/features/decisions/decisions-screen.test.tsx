import type { DecisionClaim, DecisionRecords, ExtensionPaymentToCheck, QueueEntry, WaitingDropOff } from '@hold/db'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { boardRows } from './board'
import type { Viewer } from './board'
import type { DecisionGridProps } from './decision-grid'
import { DecisionsScreen } from './decisions-screen'
import type { DecisionsScreenProps } from './decisions-screen'

// The decision board as a person uses it. The grid itself needs a browser's layout and is checked end to end; here it
// is a stand-in that lists the rows it was given and opens one in place, as a click or Enter would, drawing what the
// board gives it for an opened decision.
vi.mock('./decision-grid', async () => {
  const { useState } = await import('react')
  return {
    DecisionGrid: function GridStandIn({ rows, renderDetail }: DecisionGridProps) {
      const [opened, setOpened] = useState<string | null>(null)
      const row = rows.find((each) => each.id === opened)
      return (
        <>
          <ul aria-label="Grid stand-in">
            {rows.map((each) => <li key={each.id}><button type="button" onClick={() => { setOpened(each.id) }}>{`Open ${each.id}`}</button></li>)}
          </ul>
          {row === undefined ? null : <section aria-label="Opened decision">{renderDetail(row, { ref: null })}</section>}
        </>
      )
    },
  }
})
vi.mock('@/features/claims/actions', () => ({ rewriteContestSummary: vi.fn() }))
vi.mock('@/features/extension/actions', () => ({ checkExtensionPayment: vi.fn() }))
vi.mock('@/features/self-return/actions', () => ({ confirmDropOff: vi.fn(), reportDropOffMissing: vi.fn() }))
vi.mock('@/features/operations/actions', () => ({ approveProposals: vi.fn(), rejectProposal: vi.fn(), postponeProposal: vi.fn() }))
vi.mock('@/features/auth/passkey-button', () => ({ PasskeyButton: ({ label }: { label: string }) => <button type="button">{label}</button> }))

const NOW = new Date('2026-10-14T09:12:00Z')
const at = (iso: string) => new Date(iso)
const owner: Viewer = { userId: 'owner-1', role: 'owner', approvalLimitCents: 0 }
const counter: Viewer = { userId: 'staff-1', role: 'counter_staff', approvalLimitCents: 100_00 }

const claim = (overrides: Partial<DecisionClaim> = {}): DecisionClaim => ({
  claimId: 'claim-1', rentalId: '00000000-0000-4000-8000-000000000001', renterName: 'Priya Natarajan', state: 'awaiting_approval', totalCents: 35_00, currency: 'EUR', raisedByUserId: 'staff-1',
  createdAt: at('2026-10-13T17:30:00Z'), reservedCents: 250_00, holdValidUntil: at('2026-11-10T10:00:00Z'), renterComment: null, simulated: true, decideBy: null, promiseMissedAt: null,
  lines: [{ id: 'line-1', description: 'Scratch on the frame, through the paint', amountCents: 35_00, source: 'finding', reason: null, region: { x: 0.3, y: 0.5, width: 0.1, height: 0.1 }, beforeKey: 'before.jpg', afterKey: 'after.jpg' }],
  ...overrides,
})
const release = (id: string, rentalId: string, amountCents: number): QueueEntry => ({
  id, kind: 'release_hold', subjectKind: 'hold', subjectId: `hold-${id}`, rentalId, reason: 'The comparison was clean.', references: ['AUTH-7Y21'], draft: null, raisedByAgent: false, model: null,
  deadline: at('2026-10-14T18:00:00Z'), exceptionKind: 'clean_return_unconfirmed', amountCents, currency: 'EUR', moneyCents: amountCents, payload: { fixedReason: 'clean_return_unconfirmed', investigated: 'no', paypalChecked: 'yes' },
})
const records = (overrides: Partial<DecisionRecords> = {}): DecisionRecords => ({
  claims: [claim(), claim({ claimId: 'claim-2', rentalId: '00000000-0000-4000-8000-000000000002', renterName: 'Tom Becker', state: 'contested', totalCents: 45_00, raisedByUserId: 'owner-1', simulated: false, renterComment: 'The lock was in the bag when I handed it back.', lines: [{ id: 'line-2', description: 'Lost lock', amountCents: 45_00, source: 'person', reason: 'No lock in the bag at the return.', region: null, beforeKey: null, afterKey: null }] })],
  proposals: [release('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000003', 300_00), release('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000004', 250_00)],
  incidents: [],
  holds: [],
  late: [{ rentalId: '00000000-0000-4000-8000-000000000005', renterName: 'Lea Fischer', endsAt: at('2026-10-13T17:00:00Z'), simulated: false }],
  dropOffs: [],
  extensionPayments: [],
  repairs: [],
  staffCount: 2,
  ...overrides,
})

const dropOff: WaitingDropOff = {
  rentalId: '00000000-0000-4000-8000-000000000006', renterName: 'Chloé Martin', droppedOffAt: at('2026-10-13T21:40:00Z'), onTime: true, missingAt: null, missingBy: null, holdCents: 250_00, currency: 'EUR', simulated: false,
  items: [{ label: 'E-bike 3', views: 4, findings: 1, comparison: 'findings', comparisonId: 'comparison-1', dropPoint: { view: 'drop_point', displayKey: 'drop.jpg' }, viewLabel: 'Left side', before: { view: 'left', displayKey: 'before.jpg' }, after: { view: 'left', displayKey: 'after.jpg' }, region: { x: 0.3, y: 0.5, width: 0.1, height: 0.1 } }],
}
const latePayment: ExtensionPaymentToCheck = {
  extensionId: '00000000-0000-4000-8000-0000000000e1', rentalId: '00000000-0000-4000-8000-000000000007', renterName: 'Sofia Lopes', attention: 'paid_after_expiry', attentionAt: at('2026-10-14T08:30:00Z'),
  quotedCents: 45_00, capturedCents: 45_00, currency: 'EUR', paypalCaptureId: 'CAPTURE-9', extraDays: 1, simulated: false,
}
const contest = {
  outcome: 'answered' as const,
  simulated: true,
  version: { overview: 'The renter says the lock was handed back in the bag.', lines: [{ lineId: 'line-2', disputed: true, renterSays: 'They say it was in the bag.', renterQuote: 'The lock was in the bag when I handed it back.' }] },
  comment: 'The lock was in the bag when I handed it back.',
  lines: [{ id: 'line-2', description: 'Lost lock', source: 'person' as const, findingDescription: null, bothLooksConfirmed: false, knownMarkNearby: false, addedBy: 'Jonas', reason: 'No lock in the bag at the return.' }],
  rental: { conditionReply: 'confirmed' as const, conditionRepliedAt: at('2026-10-10T09:00:00Z'), renterPhotos: 0, incidentsReported: 0 },
}

const props = (viewer: Viewer = owner, overrides: Partial<DecisionsScreenProps> = {}): DecisionsScreenProps => ({
  shopName: 'Ribeira Bikes',
  clock: { timeZone: 'UTC', currency: 'EUR' },
  endOfDay: at('2026-10-15T00:00:00Z'),
  rows: boardRows(records(), viewer, NOW),
  photoUrls: { 'before.jpg': '/images/sample-handover.jpg', 'after.jpg': '/images/sample-return-damage.jpg' },
  gate: { needed: false, hasPasskey: true, email: 'owner@example.com' },
  ...overrides,
})

const list = () => screen.getByRole('list', { name: 'Decisions' })
const panel = () => screen.getByRole('region', { name: 'Opened decision' })

describe('the decision board', () => {
  it('opens with how many decisions wait, how many are the viewer’s, and how many fall due today', () => {
    renderWithIntl(<DecisionsScreen {...props(counter)} />)
    expect(screen.getByTestId('decisions-brief')).toHaveTextContent('5 decisions wait, 2 of them yours. 3 fall due today.')
  })

  it('says plainly when nothing waits, and shows no grid', () => {
    renderWithIntl(<DecisionsScreen {...props(owner, { rows: [] })} />)
    expect(screen.getByText('Nothing waits on a person.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Grid stand-in' })).not.toBeInTheDocument()
  })

  it('filters by group with each group’s count, and the grid and the list show the same rows', async () => {
    const user = userEvent.setup()
    renderWithIntl(<DecisionsScreen {...props()} />)
    await user.click(screen.getByRole('button', { name: 'Claims 2' }))
    expect(screen.getByRole('button', { name: 'Claims 2' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(list()).getAllByRole('article').map((card) => card.getAttribute('data-row'))).toEqual(['claim:claim-1', 'claim:claim-2'])
    expect(within(screen.getByRole('list', { name: 'Grid stand-in' })).getAllByRole('button')).toHaveLength(2)
  })

  it('finds a decision by the renter’s name or a PayPal reference, and says when nothing matches', async () => {
    const user = userEvent.setup()
    renderWithIntl(<DecisionsScreen {...props()} />)
    await user.type(screen.getByRole('searchbox', { name: 'Search decisions' }), 'becker')
    expect(within(list()).getAllByRole('article')).toHaveLength(1)
    await user.clear(screen.getByRole('searchbox', { name: 'Search decisions' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search decisions' }), 'AUTH-7Y21')
    expect(within(list()).getAllByRole('article')).toHaveLength(2)
    await user.type(screen.getByRole('searchbox', { name: 'Search decisions' }), ' zebra')
    expect(screen.getByText('Nothing matches. Clear the search or show every group.')).toBeInTheDocument()
  })

  it('shows only the viewer’s own decisions when asked', async () => {
    const user = userEvent.setup()
    renderWithIntl(<DecisionsScreen {...props(counter)} />)
    await user.click(screen.getByRole('checkbox', { name: 'Only mine' }))
    expect(within(list()).getAllByRole('article').map((card) => card.getAttribute('data-row'))).toEqual(['late:00000000-0000-4000-8000-000000000005', 'claim:claim-1'])
  })

  it('opens a claim’s evidence in place: its lines, both photographs, the split of the hold and where to approve it', async () => {
    const user = userEvent.setup()
    renderWithIntl(<DecisionsScreen {...props()} />)
    await user.click(screen.getByRole('button', { name: 'Open claim:claim-1' }))
    const chosen = panel()
    expect(within(chosen).getByRole('heading', { name: 'Approve a claim of €35.00' })).toBeInTheDocument()
    expect(within(chosen).getByText('Scratch on the frame, through the paint')).toBeInTheDocument()
    expect(within(chosen).getByRole('img', { name: 'At handover: Scratch on the frame, through the paint' })).toHaveAttribute('src', '/images/sample-handover.jpg')
    expect(within(chosen).getByRole('img', { name: 'At return: Scratch on the frame, through the paint' })).toHaveAttribute('src', '/images/sample-return-damage.jpg')
    expect(within(chosen).getByTestId('split-capture')).toHaveTextContent('€35.00')
    expect(within(chosen).getByTestId('split-release')).toHaveTextContent('€215.00')
    expect(within(chosen).getByText('Sample')).toBeInTheDocument()
    expect(within(chosen).getByRole('link', { name: 'Review and approve on the claim page' })).toHaveAttribute('href', '/shop/rentals/00000000-0000-4000-8000-000000000001/claim')
  })

  it('quotes a contested claim’s renter as their own words and shows the reason a person wrote for a line', async () => {
    const user = userEvent.setup()
    renderWithIntl(<DecisionsScreen {...props()} />)
    await user.click(screen.getByRole('button', { name: 'Open claim:claim-2' }))
    const chosen = panel()
    expect(within(chosen).getByRole('heading', { name: 'Decide a contested claim of €45.00' })).toBeInTheDocument()
    expect(within(chosen).getByRole('blockquote')).toHaveTextContent('The lock was in the bag when I handed it back.')
    expect(within(chosen).getByText('No lock in the bag at the return.')).toBeInTheDocument()
    expect(within(chosen).getByText('Another owner or manager decides: you raised it.')).toBeInTheDocument()
  })

  // JW-M4: a decision the viewer may not take is never offered as theirs. Who may decide is the domain's rule
  // (mayConfirm, through boardRows), the same one the server checks.
  it('offers counter staff no way to decide a contested claim, and says who may', async () => {
    const user = userEvent.setup()
    renderWithIntl(<DecisionsScreen {...props(counter)} />)
    await user.click(screen.getByRole('button', { name: 'Open claim:claim-2' }))
    const chosen = panel()
    expect(within(chosen).getByText('Only an owner or manager can decide this.')).toBeInTheDocument()
    expect(within(chosen).queryByRole('link', { name: 'Decide on the claim page' })).not.toBeInTheDocument()
    expect(within(chosen).getByRole('link', { name: 'Open the claim page' })).toHaveAttribute('href', '/shop/rentals/00000000-0000-4000-8000-000000000002/claim')
  })

  it('offers counter staff no approval of a claim above their limit, and says who may', async () => {
    const user = userEvent.setup()
    const rows = boardRows(records({ claims: [claim({ totalCents: 400_00 })] }), counter, NOW)
    renderWithIntl(<DecisionsScreen {...props(counter, { rows })} />)
    await user.click(screen.getByRole('button', { name: 'Open claim:claim-1' }))
    expect(within(panel()).getByText('Only an owner or manager can decide this.')).toBeInTheDocument()
    expect(within(panel()).queryByRole('link', { name: 'Review and approve on the claim page' })).not.toBeInTheDocument()
  })

  it('tells the owner who raised a contested claim that another owner or manager decides it', async () => {
    const user = userEvent.setup()
    renderWithIntl(<DecisionsScreen {...props(owner)} />)
    await user.click(screen.getByRole('button', { name: 'Open claim:claim-2' }))
    expect(within(panel()).getByText('You raised this claim, so another owner or manager decides it.')).toBeInTheDocument()
    expect(within(panel()).queryByRole('link', { name: 'Decide on the claim page' })).not.toBeInTheDocument()
  })

  it('leads an owner who may decide a contested claim to where it is decided, with no refusal', async () => {
    const user = userEvent.setup()
    const rows = boardRows(records({ claims: [claim({ claimId: 'claim-3', state: 'contested', raisedByUserId: 'staff-1' })] }), owner, NOW)
    renderWithIntl(<DecisionsScreen {...props(owner, { rows })} />)
    await user.click(screen.getByRole('button', { name: 'Open claim:claim-3' }))
    expect(within(panel()).getByRole('link', { name: 'Decide on the claim page' })).toBeInTheDocument()
    expect(within(panel()).queryByText(/can decide this|decides it\./)).not.toBeInTheDocument()
  })

  it('opens a contested claim on the neutral summary of where the two sides differ', async () => {
    const user = userEvent.setup()
    renderWithIntl(<DecisionsScreen {...props(owner, { rows: boardRows(records(), owner, NOW, { 'claim-2': contest }) })} />)
    await user.click(screen.getByRole('button', { name: 'Open claim:claim-2' }))
    const summary = within(panel()).getByRole('region', { name: 'Where the two sides differ' })
    expect(within(summary).getByText('The renter says the lock was handed back in the bag.')).toBeInTheDocument()
    expect(within(summary).getByText('Disputed: 1 of 1 line')).toBeInTheDocument()
    expect(within(summary).getByText('Simulated summary')).toBeInTheDocument()
  })

  it('offers to write the summary of a contest that has none yet, to whoever may decide it', async () => {
    const user = userEvent.setup()
    const pending = { ...contest, outcome: 'pending' as const, version: null }
    renderWithIntl(<DecisionsScreen {...props(owner, { rows: boardRows(records(), owner, NOW, { 'claim-2': pending }) })} />)
    await user.click(screen.getByRole('button', { name: 'Open claim:claim-2' }))
    expect(within(panel()).getByText('No summary has been written yet. The renter’s words and the records are below.')).toBeInTheDocument()
    expect(within(panel()).getByRole('button', { name: 'Write the summary' })).toBeInTheDocument()
  })

  it('opens what a renter dropped off: when, what the comparison found, the photographs and the two choices', async () => {
    const user = userEvent.setup()
    renderWithIntl(<DecisionsScreen {...props(counter, { rows: boardRows(records({ dropOffs: [dropOff] }), counter, NOW), photoUrls: { 'before.jpg': '/before.jpg', 'after.jpg': '/after.jpg', 'drop.jpg': '/drop.jpg' } })} />)
    await user.click(screen.getByRole('button', { name: 'Open drop:00000000-0000-4000-8000-000000000006' }))
    const chosen = panel()
    expect(within(chosen).getByRole('heading', { name: 'Check what Chloé Martin dropped off' })).toBeInTheDocument()
    expect(within(chosen).getByText(/on time/)).toBeInTheDocument()
    expect(within(chosen).getByText('1 finding')).toBeInTheDocument()
    expect(within(chosen).getByRole('img', { name: 'Where they left it' })).toHaveAttribute('src', '/drop.jpg')
    expect(within(chosen).getByRole('button', { name: 'It’s here, review the return' })).toBeInTheDocument()
    expect(within(chosen).getByRole('button', { name: 'It’s not here' })).toBeInTheDocument()
  })

  it('puts a payment PayPal completed after Hold stopped waiting before the owner, with what to do in PayPal', async () => {
    const user = userEvent.setup()
    renderWithIntl(<DecisionsScreen {...props(owner, { rows: boardRows(records({ extensionPayments: [latePayment] }), owner, NOW) })} />)
    await user.click(screen.getByRole('button', { name: 'Open extension:00000000-0000-4000-8000-0000000000e1' }))
    const chosen = panel()
    expect(within(chosen).getByRole('heading', { name: 'Check an extra-days payment from Sofia Lopes' })).toBeInTheDocument()
    expect(within(chosen).getByText(/PayPal completed this payment after Hold had stopped waiting for it/)).toBeInTheDocument()
    expect(within(chosen).getByText('CAPTURE-9')).toBeInTheDocument()
    expect(within(chosen).getByRole('button', { name: 'Mark as checked' })).toBeInTheDocument()
  })

  it('tells counter staff an owner or manager checks an extra-days payment, and offers them nothing to press', async () => {
    const user = userEvent.setup()
    renderWithIntl(<DecisionsScreen {...props(counter, { rows: boardRows(records({ extensionPayments: [{ ...latePayment, attention: 'amount_mismatch', capturedCents: 1 }] }), counter, NOW) })} />)
    await user.click(screen.getByRole('button', { name: 'Open extension:00000000-0000-4000-8000-0000000000e1' }))
    expect(within(panel()).getByText(/PayPal took another amount than Hold's price/)).toBeInTheDocument()
    expect(within(panel()).getByText('An owner or manager decides.')).toBeInTheDocument()
    expect(within(panel()).queryByRole('button', { name: 'Mark as checked' })).not.toBeInTheDocument()
  })

  it('lets an owner approve, postpone or reject the agent’s proposal where it stands, with its reason and PayPal reference', async () => {
    const user = userEvent.setup()
    renderWithIntl(<DecisionsScreen {...props()} />)
    await user.click(screen.getByRole('button', { name: 'Open proposal:00000000-0000-4000-8000-0000000000a1' }))
    const chosen = panel()
    expect(within(chosen).getByRole('heading', { name: 'Release the hold to the renter' })).toBeInTheDocument()
    expect(within(chosen).getByText('The comparison was clean and nobody has confirmed the return.')).toBeInTheDocument()
    expect(within(chosen).getByText('AUTH-7Y21')).toBeInTheDocument()
    expect(within(chosen).getByText('Not investigated')).toBeInTheDocument()
    expect(within(chosen).getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(within(chosen).getByRole('button', { name: 'Postpone until tomorrow' })).toBeInTheDocument()
  })

  it('tells counter staff an owner or manager decides the agent’s proposal, and offers them no approval', async () => {
    const user = userEvent.setup()
    renderWithIntl(<DecisionsScreen {...props(counter)} />)
    await user.click(screen.getByRole('button', { name: 'Open proposal:00000000-0000-4000-8000-0000000000a1' }))
    expect(within(panel()).getByText('An owner or manager decides.')).toBeInTheDocument()
    expect(within(panel()).queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Choose the release/ })).not.toBeInTheDocument()
  })

  it('approves chosen releases together, saying how many and how much goes back to renters', async () => {
    const user = userEvent.setup()
    renderWithIntl(<DecisionsScreen {...props()} />)
    const cards = within(list()).getAllByRole('article').filter((card) => card.getAttribute('data-row')?.startsWith('proposal:') === true)
    for (const card of cards) await user.click(within(card).getByRole('checkbox', { name: /Choose the release/ }))
    const together = screen.getByRole('region', { name: 'Releases chosen' })
    expect(together).toHaveTextContent('2 releases chosen: €550.00 back to renters.')
    expect(within(together).getByRole('button', { name: 'Approve these releases' })).toBeInTheDocument()
  })

  it('asks for the passkey before releases can be approved together, when the session has not confirmed one', async () => {
    const user = userEvent.setup()
    renderWithIntl(<DecisionsScreen {...props(owner, { gate: { needed: true, hasPasskey: true, email: 'owner@example.com' } })} />)
    expect(screen.getByRole('button', { name: 'Confirm with my passkey' })).toBeInTheDocument()
    const card = within(list()).getAllByRole('article').find((each) => each.getAttribute('data-row')?.startsWith('proposal:') === true)
    if (card === undefined) throw new Error('No release card.')
    await user.click(within(card).getByRole('checkbox', { name: /Choose the release/ }))
    const together = screen.getByRole('region', { name: 'Releases chosen' })
    expect(within(together).queryByRole('button', { name: 'Approve these releases' })).not.toBeInTheDocument()
    expect(together).toHaveTextContent('Confirm with your passkey to approve releases.')
  })

  it('on a phone, opens each decision’s evidence and actions in its own card', async () => {
    const user = userEvent.setup()
    renderWithIntl(<DecisionsScreen {...props()} />)
    const card = within(list()).getAllByRole('article').find((each) => each.getAttribute('data-row') === 'late:00000000-0000-4000-8000-000000000005')
    if (card === undefined) throw new Error('No late card.')
    expect(within(card).getByRole('heading', { name: 'Lea Fischer is late' })).toBeInTheDocument()
    await user.click(within(card).getByText('Evidence and actions'))
    expect(within(card).getByRole('link', { name: 'Open the rental' })).toHaveAttribute('href', '/shop/rentals/00000000-0000-4000-8000-000000000005')
  })
})
