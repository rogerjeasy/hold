import type { QueueEntry } from '@hold/db'
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { QueueScreen } from './queue-screen'
import type { QueueScreenProps } from './queue-screen'

vi.mock('./actions', () => ({
  approveProposals: vi.fn(), rejectProposal: vi.fn(), postponeProposal: vi.fn(), checkNow: vi.fn(), confirmRule: vi.fn(), discardRule: vi.fn(), grantStandingRule: vi.fn(), revokeStandingRule: vi.fn(),
}))
vi.mock('@/features/auth/passkey-button', () => ({ PasskeyButton: ({ label }: { label: string }) => <button type="button">{label}</button> }))

const now = new Date('2026-10-27T07:00:00Z')
const entry = (overrides: Partial<QueueEntry> = {}): QueueEntry => ({
  id: '00000000-0000-4000-8000-000000000001', kind: 'request_replacement_hold', subjectKind: 'hold', subjectId: 'hold-1', rentalId: '00000000-0000-4000-8000-0000000000aa',
  reason: 'The hold ends within three days and the rental is still open.', references: [], draft: null, raisedByAgent: false, deadline: new Date('2026-10-27T15:00:00Z'), exceptionKind: 'hold_ending',
  amountCents: 30000, currency: 'EUR', moneyCents: 30000, payload: { fixedReason: 'hold_ending', investigated: 'no', paypalChecked: 'no' }, ...overrides,
})
const props = (overrides: Partial<QueueScreenProps> = {}): QueueScreenProps => ({
  shopName: 'Ribeira Bikes', clock: { timeZone: 'UTC', currency: 'EUR' }, endOfDay: new Date('2026-10-28T00:00:00Z'),
  entries: [entry()], recent: [], rules: [], standingRule: undefined, canDecide: true, isOwner: true, gate: { needed: false, hasPasskey: true, email: 'owner@example.com' }, ...overrides,
})

describe('the morning queue', () => {
  it('opens with how many decisions wait and how many expire today', () => {
    renderWithIntl(<QueueScreen {...props({ entries: [entry(), entry({ id: '00000000-0000-4000-8000-000000000002', deadline: null })] })} />)
    expect(screen.getByTestId('queue-brief')).toHaveTextContent('2 decisions wait, and 1 expires today.')
  })

  it('says what will happen, why in the words of its detector, the amount from the records and what the agent could not do', () => {
    renderWithIntl(<QueueScreen {...props()} />)
    const group = screen.getByRole('region', { name: 'Replacement holds' })
    const card = within(group).getByRole('article', { name: 'Ask the renter for a new hold' })
    expect(within(card).getByTestId('entry-amount')).toHaveTextContent('€300.00')
    expect(within(card).getByText('The hold ends within three days and the rental is still open.')).toBeInTheDocument()
    expect(within(card).getByText('Not investigated')).toBeInTheDocument()
    expect(within(card).getByText('PayPal could not be checked')).toBeInTheDocument()
    expect(within(card).getByText('Decide by Oct 27 03:00 PM')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(within(card).getByText('Reject with a reason')).toBeInTheDocument()
  })

  it('shows the agent\'s own reason, references and draft as text, and labels an observation and a removed draft', () => {
    renderWithIntl(<QueueScreen {...props({ entries: [entry({ kind: 'note', amountCents: null, currency: null, raisedByAgent: true, reason: 'Bike 3 came back scratched <b>three</b> times.', references: ['CAPTURE-9'], draft: 'Dear Priya', payload: { draftDropped: 'yes' } })] })} />)
    expect(screen.getByText('Bike 3 came back scratched <b>three</b> times.')).toBeInTheDocument()
    expect(screen.getByText('CAPTURE-9')).toBeInTheDocument()
    expect(screen.getByText('Dear Priya')).toBeInTheDocument()
    expect(screen.getByText('Observation raised by the agent')).toBeInTheDocument()
    expect(screen.getByText('Draft removed: its amounts did not match the records')).toBeInTheDocument()
    expect(screen.queryByTestId('entry-amount')).not.toBeInTheDocument()
  })

  it('lets several releases be chosen to approve together, and nothing else', () => {
    const release = (id: string) => entry({ id, kind: 'release_hold', payload: {} })
    renderWithIntl(<QueueScreen {...props({ entries: [release('00000000-0000-4000-8000-000000000003'), release('00000000-0000-4000-8000-000000000004'), entry()] })} />)
    expect(screen.getAllByRole('checkbox', { name: 'Choose to approve together' })).toHaveLength(2)
    expect(within(screen.getByRole('region', { name: 'Releases' })).getByRole('button', { name: 'Approve the chosen releases' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Replacement holds' })).queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('holds back approving what moves money until the passkey is confirmed, but not rejecting or postponing', () => {
    renderWithIntl(<QueueScreen {...props({ gate: { needed: true, hasPasskey: true, email: 'owner@example.com' } })} />)
    expect(screen.getByText('Approving what releases or asks for money needs your passkey. Rejecting and postponing do not.')).toBeInTheDocument()
    const card = screen.getByRole('article', { name: 'Ask the renter for a new hold' })
    expect(within(card).queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Postpone until tomorrow' })).toBeInTheDocument()
  })

  it('gives counter staff and read-only members the queue to read, with no controls', () => {
    renderWithIntl(<QueueScreen {...props({ canDecide: false, isOwner: false })} />)
    expect(screen.getByText('Owners and managers decide. You can read the queue.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Only the owner turns it on or off.')).toBeInTheDocument()
  })

  it('says when nothing waits, what became of recent decisions, and the rules and standing rule in force', () => {
    renderWithIntl(<QueueScreen {...props({
      entries: [],
      recent: [{ id: 'p1', kind: 'release_hold', state: 'superseded', decisionReason: null, postponedUntil: null }, { id: 'p2', kind: 'request_replacement_hold', state: 'rejected', decisionReason: 'Renews in person.', postponedUntil: null }],
      rules: [{ id: 'r1', rule: { kind: 'never', proposalKind: 'request_replacement_hold' }, state: 'drafted', suggestedCents: 30000 }, { id: 'r2', rule: { kind: 'below_amount', proposalKind: 'send_invoice', cents: 1000 }, state: 'confirmed', suggestedCents: null }],
      standingRule: { id: 'm1', kind: 'ops_standing_rule', grantedTo: 'operations_agent', validFrom: now, validUntil: new Date('2026-11-26T07:00:00Z'), revokedAt: null, limits: { proposalKind: 'release_hold', condition: 'clean_return_unconfirmed', dailyCount: 3 } },
    })} />)
    expect(screen.getByText('Nothing waits for a decision.')).toBeInTheDocument()
    expect(screen.getByText('The records changed after it was proposed, so nothing was done.')).toBeInTheDocument()
    expect(screen.getByText('Reason given: Renews in person.')).toBeInTheDocument()
    expect(screen.getByText('Do not propose asking for a new hold.')).toBeInTheDocument()
    expect(screen.getByLabelText('Amount, in EUR')).toHaveValue('300.00')
    expect(screen.getByText('Do not propose sending an invoice below €10.00.')).toBeInTheDocument()
    expect(screen.getByTestId('standing-rule-state')).toHaveTextContent('On until Thursday, November 26 07:00 AM, for up to 3 releases a day.')
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeInTheDocument()
  })
})
