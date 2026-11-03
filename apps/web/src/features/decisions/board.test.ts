import type { DecisionClaim, DecisionRecords, ExtensionPaymentToCheck, QueueEntry, ShopIncident, WaitingDropOff } from '@hold/db'
import { describe, expect, it } from 'vitest'
import { boardBrief, boardRows, groupCounts, visibleRows } from './board'
import type { Viewer } from './board'

// The decision board (extensions.md section 12.5): every record that waits on a person becomes one row, says who may
// decide it from where the viewer stands, and comes in the order it falls due.

const NOW = new Date('2026-10-14T09:12:00Z')
const at = (iso: string) => new Date(iso)
const owner: Viewer = { userId: 'owner-1', role: 'owner', approvalLimitCents: 0 }
const counter: Viewer = { userId: 'staff-1', role: 'counter_staff', approvalLimitCents: 100_00 }
const reader: Viewer = { userId: 'reader-1', role: 'read_only', approvalLimitCents: 0 }

const claim = (overrides: Partial<DecisionClaim> = {}): DecisionClaim => ({
  claimId: 'claim-1',
  rentalId: 'rental-1',
  renterName: 'Priya Natarajan',
  state: 'awaiting_approval',
  totalCents: 35_00,
  currency: 'EUR',
  raisedByUserId: 'staff-1',
  createdAt: at('2026-10-13T17:30:00Z'),
  reservedCents: 250_00,
  holdValidUntil: at('2026-11-10T10:00:00Z'),
  renterComment: null,
  simulated: false,
  decideBy: null,
  promiseMissedAt: null,
  lines: [{ id: 'line-1', description: 'Scratch on the frame', amountCents: 35_00, source: 'finding', reason: null, region: { x: 0.3, y: 0.5, width: 0.1, height: 0.1 }, beforeKey: 'before.jpg', afterKey: 'after.jpg' }],
  ...overrides,
})

const proposal = (overrides: Partial<QueueEntry> = {}): QueueEntry => ({
  id: 'proposal-1',
  kind: 'release_hold',
  subjectKind: 'hold',
  subjectId: 'hold-2',
  rentalId: 'rental-2',
  reason: 'The return was clean and nobody confirmed it.',
  references: ['AUTH-123'],
  draft: null,
  raisedByAgent: true,
  model: null,
  deadline: at('2026-10-14T18:00:00Z'),
  exceptionKind: 'clean_return_unconfirmed',
  amountCents: 300_00,
  currency: 'EUR',
  moneyCents: 300_00,
  payload: { investigated: 'yes', paypalChecked: 'yes' },
  ...overrides,
})

const incident = (overrides: Partial<ShopIncident> = {}): ShopIncident => ({
  id: 'incident-1',
  rentalId: 'rental-3',
  state: 'awaiting_staff',
  sentAt: at('2026-10-14T08:00:00Z'),
  kind: 'mechanical_fault',
  hint: 'fault',
  description: 'The chain keeps slipping.',
  safety: false,
  model: null,
  triageOutcome: null,
  simulated: false,
  currency: 'EUR',
  agreedCents: null,
  theftDetails: null,
  staffAlertedAt: null,
  reportedAt: at('2026-10-14T07:55:00Z'),
  priceListId: 'prices-1',
  itemLabel: 'E-bike 2',
  renterName: 'Lea Fischer',
  suggestion: null,
  offer: null,
  prices: [],
  ...overrides,
})

const records = (overrides: Partial<DecisionRecords> = {}): DecisionRecords => ({ claims: [], proposals: [], incidents: [], holds: [], late: [], dropOffs: [], extensionPayments: [], repairs: [], staffCount: 2, ...overrides })

const extensionPayment: ExtensionPaymentToCheck = {
  extensionId: 'extension-1', rentalId: 'rental-11', renterName: 'Sofia Lopes', attention: 'paid_after_expiry', attentionAt: at('2026-10-14T08:30:00Z'),
  quotedCents: 45_00, capturedCents: 45_00, currency: 'EUR', paypalCaptureId: 'CAPTURE-9', extraDays: 1, simulated: false,
}

const dropOff = (overrides: Partial<WaitingDropOff> = {}): WaitingDropOff => ({
  rentalId: 'rental-10',
  renterName: 'Chloé Martin',
  droppedOffAt: at('2026-10-13T21:40:00Z'),
  onTime: true,
  missingAt: null,
  missingBy: null,
  holdCents: 250_00,
  currency: 'EUR',
  simulated: false,
  items: [{ label: 'E-bike 3', views: 4, findings: 1, comparison: 'findings', comparisonId: 'comparison-1', dropPoint: { view: 'drop_point', displayKey: 'drop.jpg' }, viewLabel: 'Left side', before: { view: 'left', displayKey: 'before.jpg' }, after: { view: 'left', displayKey: 'after.jpg' }, region: null }],
  ...overrides,
})

const endingHold = { rentalId: 'rental-4', renterName: 'Marco Rossi', reservedCents: 300_00, createdAt: at('2026-09-17T10:00:00Z'), assuredUntil: at('2026-09-20T10:00:00Z'), validUntil: at('2026-10-16T10:00:00Z'), simulated: false }

describe('the rows of the decision board', () => {
  it('makes one row of each record that waits on a person, each named by its kind', () => {
    const rows = boardRows(records({
      claims: [claim(), claim({ claimId: 'claim-2', rentalId: 'rental-5', state: 'contested', renterComment: 'It was already there.' }), claim({ claimId: 'claim-3', rentalId: 'rental-6', state: 'escalated' })],
      proposals: [proposal()],
      incidents: [incident()],
      holds: [endingHold],
      late: [{ rentalId: 'rental-7', renterName: 'Ahmed Khan', endsAt: at('2026-10-13T18:00:00Z'), simulated: false }],
      dropOffs: [dropOff()],
    }), owner, NOW)
    expect(rows.map((row) => [row.kind, row.group]).sort()).toEqual([
      ['claim', 'claims'],
      ['contested', 'claims'],
      ['dropped_off', 'counter'],
      ['escalated', 'claims'],
      ['hold_ending', 'counter'],
      ['incident', 'incidents'],
      ['late', 'counter'],
      ['proposal', 'agent'],
    ])
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length)
  })

  it('asks a person to check what a renter dropped off, with the hold still on it, waiting since it was left', () => {
    const [row] = boardRows(records({ dropOffs: [dropOff()] }), counter, NOW)
    expect(row).toMatchObject({ id: 'drop:rental-10', kind: 'dropped_off', rentalId: 'rental-10', renterName: 'Chloé Martin', due: null, overdue: false, waitingSince: at('2026-10-13T21:40:00Z'), amountCents: 250_00, decider: 'you', selectable: false, onTime: true })
    expect(row?.kind === 'dropped_off' ? row.items.map((item) => item.label) : []).toEqual(['E-bike 3'])
    expect(boardRows(records({ dropOffs: [dropOff()] }), reader, NOW)[0]?.decider).toBe('staff')
  })

  it('puts money PayPal moved for extra days that Hold did not apply before an owner or manager', () => {
    const [row] = boardRows(records({ extensionPayments: [extensionPayment] }), owner, NOW)
    expect(row).toMatchObject({ id: 'extension:extension-1', kind: 'extension_payment', group: 'counter', rentalId: 'rental-11', due: null, waitingSince: at('2026-10-14T08:30:00Z'), amountCents: 45_00, decider: 'you', attention: 'paid_after_expiry', quotedCents: 45_00, paypalCaptureId: 'CAPTURE-9' })
    expect(boardRows(records({ extensionPayments: [extensionPayment] }), counter, NOW)[0]?.decider).toBe('senior')
    expect(boardRows(records({ extensionPayments: [extensionPayment] }), reader, NOW)[0]?.decider).toBe('staff')
  })

  it('carries the neutral summary of a contested claim with its row, and nothing for a claim not contested', () => {
    const contest = { outcome: 'pending' as const, simulated: false, version: null, comment: 'It was already there.', lines: [], rental: { conditionReply: null, conditionRepliedAt: null, renterPhotos: 0, incidentsReported: 0 } }
    const rows = boardRows(records({ claims: [claim(), claim({ claimId: 'claim-2', state: 'contested' })] }), owner, NOW, { 'claim-2': contest })
    expect(rows.map((row) => (row.kind === 'claim' || row.kind === 'contested' ? [row.kind, row.contest] : []))).toEqual([['claim', null], ['contested', contest]])
  })

  it('leaves out a hold that is not near its end', () => {
    const rows = boardRows(records({ holds: [{ ...endingHold, createdAt: at('2026-10-12T10:00:00Z'), assuredUntil: at('2026-10-15T10:00:00Z'), validUntil: at('2026-11-10T10:00:00Z') }] }), owner, NOW)
    expect(rows).toEqual([])
  })

  it('shows a hold near its end once, as the agent’s proposal when there is one for it', () => {
    const rows = boardRows(records({ holds: [endingHold], proposals: [proposal({ kind: 'request_replacement_hold', rentalId: endingHold.rentalId })] }), owner, NOW)
    expect(rows.map((row) => row.kind)).toEqual(['proposal'])
  })

  it('takes a claim’s amount and its split of the hold from the records, and falls due when its hold ends', () => {
    const [row] = boardRows(records({ claims: [claim()] }), owner, NOW)
    expect(row).toMatchObject({ kind: 'claim', amountCents: 35_00, due: at('2026-11-10T10:00:00Z'), settlement: { captureCents: 35_00, releaseCents: 215_00, invoiceCents: 0 } })
  })

  it('splits a claim larger than its hold into what is taken and what is invoiced', () => {
    const [row] = boardRows(records({ claims: [claim({ totalCents: 300_00 })] }), owner, NOW)
    expect(row).toMatchObject({ settlement: { captureCents: 250_00, releaseCents: 0, invoiceCents: 50_00 } })
  })

  it('comes in the order it falls due, what is late first, then what has no date, oldest first', () => {
    const rows = boardRows(records({
      claims: [claim()],
      proposals: [proposal()],
      incidents: [incident({ id: 'incident-old', reportedAt: at('2026-10-13T08:00:00Z') }), incident({ id: 'incident-new' })],
      holds: [endingHold],
      late: [{ rentalId: 'rental-7', renterName: 'Ahmed Khan', endsAt: at('2026-10-13T18:00:00Z'), simulated: false }],
    }), owner, NOW)
    expect(rows.map((row) => row.id)).toEqual(['late:rental-7', 'proposal:proposal-1', 'hold:rental-4', 'claim:claim-1', 'incident:incident-old', 'incident:incident-new'])
  })
})

describe('what is overdue', () => {
  it('marks a row whose date has passed, so the server and the browser say the same', () => {
    const rows = boardRows(records({ claims: [claim()], late: [{ rentalId: 'rental-7', renterName: 'Ahmed Khan', endsAt: at('2026-10-13T18:00:00Z'), simulated: false }], incidents: [incident()] }), owner, NOW)
    expect(rows.map((row) => [row.kind, row.overdue])).toEqual([['late', true], ['claim', false], ['incident', false]])
  })
})

describe('who decides, as the viewer reads it', () => {
  it('lets counter staff approve a claim within their limit, and sends a larger one to an owner or manager', () => {
    const rows = boardRows(records({ claims: [claim({ totalCents: 35_00 }), claim({ claimId: 'claim-big', totalCents: 180_00 })] }), counter, NOW)
    expect(rows.map((row) => [row.id, row.decider])).toEqual([['claim:claim-1', 'you'], ['claim:claim-big', 'senior']])
  })

  it('sends a contested claim to an owner or manager, and to another one when the viewer raised it', () => {
    const contested = claim({ state: 'contested', raisedByUserId: 'owner-1' })
    expect(boardRows(records({ claims: [contested] }), counter, NOW)[0]?.decider).toBe('senior')
    expect(boardRows(records({ claims: [contested] }), owner, NOW)[0]?.decider).toBe('another_senior')
    expect(boardRows(records({ claims: [contested], staffCount: 1 }), owner, NOW)[0]?.decider).toBe('you')
  })

  it('puts a repair to do with the counter’s work, for any staff member, with what was claimed for it', () => {
    const repair = { id: 'repair-1', itemId: 'item-7', itemLabel: 'Cube Touring 54', claimId: 'claim-9', currency: 'EUR', createdAt: at('2026-10-14T10:00:00Z'), renterName: 'Lena Brandt', claimedCents: 90_00, simulated: false }
    const [row] = boardRows(records({ repairs: [repair] }), counter, NOW)
    expect(row).toMatchObject({ id: 'repair:repair-1', kind: 'repair', group: 'counter', itemId: 'item-7', itemLabel: 'Cube Touring 54', amountCents: 90_00, due: null, waitingSince: repair.createdAt, decider: 'you', renterName: 'Lena Brandt', rentalId: null })
    expect(boardRows(records({ repairs: [{ ...repair, claimedCents: 0, claimId: null, renterName: null }] }), counter, NOW)[0]).toMatchObject({ amountCents: null })
  })

  it('falls due at the date the shop promised the renter, and once that passed only the owner decides', () => {
    const manager: Viewer = { userId: 'manager-1', role: 'manager', approvalLimitCents: 0 }
    const decideBy = new Date(NOW.getTime() + 20 * 3_600_000)
    const open = claim({ state: 'contested', raisedByUserId: 'staff-1', holdValidUntil: new Date(NOW.getTime() + 20 * 86_400_000), decideBy, promiseMissedAt: null })
    expect(boardRows(records({ claims: [open] }), manager, NOW)[0]).toMatchObject({ due: decideBy, overdue: false, promise: 'open', decider: 'you' })
    const missed = { ...open, state: 'escalated' as const, decideBy: new Date(NOW.getTime() - 3_600_000), promiseMissedAt: new Date(NOW.getTime() - 3_600_000) }
    expect(boardRows(records({ claims: [missed] }), manager, NOW)[0]).toMatchObject({ overdue: true, promise: 'missed', decider: 'owner' })
    expect(boardRows(records({ claims: [missed] }), owner, NOW)[0]).toMatchObject({ promise: 'missed', decider: 'you' })
    expect(boardRows(records({ claims: [claim()] }), owner, NOW)[0]).toMatchObject({ promise: null })
  })

  it('leaves the agent’s proposals to an owner or manager', () => {
    expect(boardRows(records({ proposals: [proposal()] }), owner, NOW)[0]?.decider).toBe('you')
    expect(boardRows(records({ proposals: [proposal()] }), counter, NOW)[0]?.decider).toBe('senior')
  })

  it('lets any staff member act on an incident, a hold near its end or a late rental, and a read-only viewer none', () => {
    const all = records({ incidents: [incident()], holds: [endingHold], late: [{ rentalId: 'rental-7', renterName: null, endsAt: at('2026-10-13T18:00:00Z'), simulated: false }], claims: [claim()], proposals: [proposal()], dropOffs: [dropOff()] })
    expect(boardRows(all, counter, NOW).filter((row) => row.group !== 'agent').every((row) => row.decider === 'you')).toBe(true)
    expect(boardRows(all, reader, NOW).every((row) => row.decider === 'staff')).toBe(true)
  })
})

describe('samples', () => {
  it('marks a proposal about a sample rental as a sample, as the rental itself is', () => {
    const rows = boardRows(records({ proposals: [proposal(), proposal({ id: 'proposal-sample', rentalId: 'rental-9', payload: { fixedReason: 'hold_ending', simulated: 'yes' } })] }), owner, NOW)
    expect(rows.map((row) => [row.id, row.simulated])).toEqual([['proposal:proposal-1', false], ['proposal:proposal-sample', true]])
  })

  it('marks a sample entry as one no model looked at yet, or as investigated with PayPal\'s facts simulated, as the queue does', () => {
    const seeded = proposal({ id: 'proposal-seeded', rentalId: 'rental-9', payload: { fixedReason: 'hold_ending', investigated: 'no', paypalChecked: 'no', simulated: 'yes' } })
    const investigated = proposal({ id: 'proposal-investigated', rentalId: 'rental-10', model: 'us.anthropic.claude-opus-4-6-v1', payload: { investigated: 'yes', paypalChecked: 'simulated', simulated: 'yes' } })
    const rows = boardRows(records({ proposals: [seeded, investigated] }), owner, NOW).flatMap((row) => (row.kind === 'proposal' ? [[row.id, row.marks.filter((mark) => mark !== 'raisedByAgent'), row.model]] : []))
    expect(rows).toEqual(expect.arrayContaining([['proposal:proposal-seeded', ['sampleNotInvestigated'], null], ['proposal:proposal-investigated', ['sampleInvestigated'], 'us.anthropic.claude-opus-4-6-v1']]))
    expect(rows).toHaveLength(2)
  })
})

describe('approving together', () => {
  it('offers only the releases the viewer may approve', () => {
    const all = records({ proposals: [proposal(), proposal({ id: 'proposal-2', kind: 'send_message', rentalId: 'rental-8' })], claims: [claim()] })
    expect(boardRows(all, owner, NOW).filter((row) => row.selectable).map((row) => row.id)).toEqual(['proposal:proposal-1'])
    expect(boardRows(all, counter, NOW).some((row) => row.selectable)).toBe(false)
  })
})

describe('the board in one sentence', () => {
  it('counts the decisions, those that are the viewer’s, and those falling due before the shop’s day ends', () => {
    const rows = boardRows(records({ claims: [claim({ totalCents: 180_00 })], proposals: [proposal()], incidents: [incident()] }), counter, NOW)
    expect(boardBrief(rows, at('2026-10-14T23:00:00Z'))).toEqual({ decisions: 3, yours: 1, dueToday: 1 })
  })

  it('counts each group for its filter', () => {
    const rows = boardRows(records({ claims: [claim(), claim({ claimId: 'claim-2', state: 'contested' })], proposals: [proposal()] }), owner, NOW)
    expect(groupCounts(rows)).toEqual({ all: 3, claims: 2, agent: 1, incidents: 0, counter: 0 })
  })
})

describe('what the board shows', () => {
  const rows = boardRows(records({
    claims: [claim({ totalCents: 180_00 }), claim({ claimId: 'claim-2', renterName: 'Tom Becker', state: 'contested' })],
    proposals: [proposal()],
    incidents: [incident()],
  }), counter, NOW)
  const textOf = (row: (typeof rows)[number]) => [row.renterName ?? '', row.kind === 'proposal' ? row.references.join(' ') : '', row.kind === 'incident' ? row.itemLabel : ''].join(' ')

  it('shows one group, or every group', () => {
    expect(visibleRows(rows, { group: 'claims', search: '', mineOnly: false }, textOf).map((row) => row.kind)).toEqual(['claim', 'contested'])
    expect(visibleRows(rows, { group: 'all', search: '', mineOnly: false }, textOf)).toHaveLength(4)
  })

  it('shows only the viewer’s own decisions when asked', () => {
    expect(visibleRows(rows, { group: 'all', search: '', mineOnly: true }, textOf).map((row) => row.kind)).toEqual(['incident'])
  })

  it('finds rows whose text holds every word searched for, in any case', () => {
    expect(visibleRows(rows, { group: 'all', search: '  tom   BECKER ', mineOnly: false }, textOf).map((row) => row.id)).toEqual(['claim:claim-2'])
    expect(visibleRows(rows, { group: 'all', search: 'auth-123', mineOnly: false }, textOf).map((row) => row.kind)).toEqual(['proposal'])
    expect(visibleRows(rows, { group: 'agent', search: 'e-bike', mineOnly: false }, textOf)).toEqual([])
  })
})
