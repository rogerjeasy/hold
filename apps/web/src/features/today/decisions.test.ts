import { addDays } from '@hold/domain'
import type { ActiveHold, DecisionClaim, DecisionRecords, LateRental, QueueEntry, WaitingDropOff } from '@hold/db'
import { describe, expect, it } from 'vitest'
import { boardRows } from '@/features/decisions/board'
import { decisionsFor, holdSummary } from './decisions'

const NOW = new Date('2026-10-14T09:12:00Z')
const OWNER = { userId: 'owner', role: 'owner', approvalLimitCents: 1000_00 } as const

function hold(name: string, placedDaysAgo: number, reservedCents = 300_00): ActiveHold {
  const createdAt = addDays(NOW, -placedDaysAgo)
  return { rentalId: name, renterName: name, reservedCents, createdAt, assuredUntil: addDays(createdAt, 3), validUntil: addDays(createdAt, 29), simulated: false }
}

const claim = (name: string, state: DecisionClaim['state']): DecisionClaim => ({
  claimId: name,
  rentalId: name,
  renterName: name,
  state,
  totalCents: 35_00,
  currency: 'EUR',
  raisedByUserId: 'staff',
  createdAt: addDays(NOW, -1),
  reservedCents: 300_00,
  holdValidUntil: addDays(NOW, 20),
  decideBy: null,
  promiseMissedAt: null,
  renterComment: state === 'contested' ? 'It was there before.' : null,
  simulated: false,
  lines: [{ id: `${name}-line`, description: 'Deep scratch', amountCents: 35_00, source: 'finding', reason: null, region: null, beforeKey: null, afterKey: null }],
})

const late: LateRental = { rentalId: 'late', renterName: 'Lea', endsAt: addDays(NOW, -1), simulated: false }
const droppedOff: WaitingDropOff = { rentalId: 'dropped', renterName: 'Priya', droppedOffAt: addDays(NOW, -0.5), onTime: true, missingAt: null, missingBy: null, holdCents: 300_00, currency: 'EUR', simulated: false, items: [] }
const proposal: QueueEntry = { id: 'proposal', kind: 'respond_to_dispute', subjectKind: 'dispute', subjectId: 'dispute', rentalId: 'disputed', reason: 'PayPal opened a dispute.', references: [], draft: null, raisedByAgent: true, model: null, deadline: addDays(NOW, 5), exceptionKind: null, amountCents: null, currency: null, moneyCents: 0, payload: {} }

const nothing: DecisionRecords = { claims: [], proposals: [], incidents: [], holds: [], late: [], dropOffs: [], repairs: [], extensionPayments: [], staffCount: 2 }
// Today lists what the decision board lists, read through the one rule that decides what waits on a person.
const today = (records: Partial<DecisionRecords>) => decisionsFor(boardRows({ ...nothing, ...records }, OWNER, NOW))

describe('the decisions waiting', () => {
  it('puts claims to approve first, then holds near their end, then late returns, then contested claims', () => {
    const decisions = today({ claims: [claim('Tom', 'contested'), claim('Priya', 'awaiting_approval')], holds: [hold('Marco', 26.5), hold('Sofia', 1)], late: [late] })
    expect(decisions.map((decision) => [decision.kind, decision.renterName])).toEqual([
      ['claim', 'Priya'],
      ['hold_ending', 'Marco'],
      ['late', 'Lea'],
      ['contested', 'Tom'],
    ])
  })

  it('gives the day of a hold near its end', () => {
    const [ending] = today({ holds: [hold('Marco', 26.5)] })
    expect(ending).toMatchObject({ kind: 'hold_ending', day: 27 })
  })

  it('is empty on a quiet day', () => {
    expect(today({ holds: [hold('Sofia', 1)] })).toEqual([])
  })

  it('puts an item a renter dropped off before everything else, since it waits unattended at the drop point', () => {
    const decisions = today({ claims: [claim('Tom', 'awaiting_approval')], late: [late], dropOffs: [droppedOff] })
    expect(decisions[0]).toEqual({ kind: 'dropped_off', key: 'drop:dropped', rentalId: 'dropped', renterName: 'Priya', simulated: false, droppedOffAt: droppedOff.droppedOffAt })
  })

  // Today and the decision board once counted 5 and 7 on the same shop (audit finding JW-L3).
  it('lists everything the decision board lists, the agent’s proposals among them, after the counter’s own', () => {
    const records = { claims: [claim('Priya', 'awaiting_approval'), claim('Ines', 'escalated')], holds: [hold('Marco', 26.5)], proposals: [proposal] }
    const decisions = today(records)
    expect(decisions).toHaveLength(boardRows({ ...nothing, ...records }, OWNER, NOW).length)
    expect(decisions.map((decision) => decision.kind)).toEqual(['claim', 'hold_ending', 'board', 'board'])
  })

  it('shows a hold the agent already proposes to replace once, as the agent’s proposal, as the board does', () => {
    const replacement = { ...proposal, id: 'replace', kind: 'request_replacement_hold' as const, rentalId: 'Marco' }
    expect(today({ holds: [hold('Marco', 26.5)], proposals: [replacement] }).map((decision) => decision.kind)).toEqual(['board'])
  })
})

describe('the holds summary', () => {
  it('adds up what is held, and counts the holds by where they stand', () => {
    expect(holdSummary([hold('a', 1, 250_00), hold('b', 2, 600_00), hold('c', 10, 500_00), hold('d', 27, 300_00)], NOW)).toEqual({
      heldCents: 1650_00,
      count: 4,
      assured: 2,
      valid: 1,
      ending: 1,
    })
  })
})
