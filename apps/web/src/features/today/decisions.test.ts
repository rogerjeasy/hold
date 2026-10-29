import { addDays } from '@hold/domain'
import type { ActiveHold, ClaimWaiting, DroppedOff, LateRental } from '@hold/db'
import { describe, expect, it } from 'vitest'
import { decisionsFor, holdSummary } from './decisions'

const NOW = new Date('2026-10-14T09:12:00Z')

function hold(name: string, placedDaysAgo: number, reservedCents = 300_00): ActiveHold {
  const createdAt = addDays(NOW, -placedDaysAgo)
  return { rentalId: name, renterName: name, reservedCents, createdAt, assuredUntil: addDays(createdAt, 3), validUntil: addDays(createdAt, 29), simulated: false }
}

const claim = (name: string, state: ClaimWaiting['state']): ClaimWaiting => ({
  claimId: name,
  rentalId: name,
  renterName: name,
  state,
  totalCents: 35_00,
  firstLine: 'Deep scratch',
  renterComment: state === 'contested' ? 'It was there before.' : null,
  simulated: false,
})

const late: LateRental = { rentalId: 'late', renterName: 'Lea', endsAt: addDays(NOW, -1), simulated: false }
const droppedOff: DroppedOff = { rentalId: 'dropped', renterName: 'Priya', droppedOffAt: addDays(NOW, -0.5), simulated: false }

describe('the decisions waiting', () => {
  it('puts claims to approve first, then holds near their end, then late returns, then contested claims', () => {
    const decisions = decisionsFor({ claimsWaiting: [claim('Tom', 'contested'), claim('Priya', 'awaiting_approval')], activeHolds: [hold('Marco', 26.5), hold('Sofia', 1)], late: [late], droppedOff: [] }, NOW)
    expect(decisions.map((decision) => [decision.kind, decision.renterName])).toEqual([
      ['claim', 'Priya'],
      ['hold_ending', 'Marco'],
      ['late', 'Lea'],
      ['contested', 'Tom'],
    ])
  })

  it('gives the day of a hold near its end', () => {
    const [ending] = decisionsFor({ claimsWaiting: [], activeHolds: [hold('Marco', 26.5)], late: [], droppedOff: [] }, NOW)
    expect(ending).toMatchObject({ kind: 'hold_ending', day: 27 })
  })

  it('is empty on a quiet day', () => {
    expect(decisionsFor({ claimsWaiting: [], activeHolds: [hold('Sofia', 1)], late: [], droppedOff: [] }, NOW)).toEqual([])
  })

  it('puts an item a renter dropped off before everything else, since it waits unattended at the drop point', () => {
    const decisions = decisionsFor({ claimsWaiting: [claim('Tom', 'awaiting_approval')], activeHolds: [], late: [late], droppedOff: [droppedOff] }, NOW)
    expect(decisions[0]).toEqual({ kind: 'dropped_off', key: 'dropped', rentalId: 'dropped', renterName: 'Priya', simulated: false, droppedOffAt: droppedOff.droppedOffAt })
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
