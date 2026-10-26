import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DETECTOR_KINDS, detectExceptions, orderQueue, reminderAllowed, suppressedByRule } from './detectors.ts'
import type { ShopSnapshot } from './detectors.ts'

const now = new Date('2026-10-30T06:00:00Z')
const hours = (count: number) => new Date(now.getTime() + count * 3_600_000)
const settings = { confirmCleanWithinHours: 4, invoiceUnpaidDays: 7, incidentWaitHours: 2 }
const empty: ShopSnapshot = { now, settings, rentals: [], holds: [], comparisons: [], claims: [], invoices: [], disputes: [], incidents: [], differences: [] }
const rental = (id: string, state = 'out', endsAt = hours(24)) => ({ id, state, endsAt, renterId: `renter-${id}` })
const hold = (rentalId: string, overrides: Partial<ShopSnapshot['holds'][number]> = {}) => ({ id: `hold-${rentalId}`, rentalId, state: 'placed', reservedCents: 30000, currency: 'CHF', validUntil: hours(24 * 20), stateChangedAt: hours(-48), replacementStarted: false, ...overrides })
const kinds = (snapshot: ShopSnapshot) => detectExceptions(snapshot).map((each) => each.kind)

describe('the detectors, which decide what needs attention', () => {
  it('see a clean return nobody confirmed in time, and not one still within its time', () => {
    const snapshot = { ...empty, rentals: [rental('r1', 'inspecting')], holds: [hold('r1')], comparisons: [{ rentalId: 'r1', state: 'clean', completedAt: hours(-5), simulated: false }] }
    expect(detectExceptions(snapshot)).toEqual([expect.objectContaining({ kind: 'clean_return_unconfirmed', subjectKind: 'hold', subjectId: 'hold-r1', allowed: ['release_hold'], moneyCents: 30000 })])
    expect(kinds({ ...snapshot, comparisons: [{ rentalId: 'r1', state: 'clean', completedAt: hours(-3), simulated: false }] })).toEqual([])
    expect(kinds({ ...snapshot, comparisons: [{ rentalId: 'r1', state: 'clean', completedAt: hours(-5), simulated: true }] })).toEqual([])
  })

  it('see a hold ending within three days with no replacement started', () => {
    const snapshot = { ...empty, rentals: [rental('r1')], holds: [hold('r1', { validUntil: hours(48) })] }
    expect(kinds(snapshot)).toEqual(['hold_ending'])
    expect(kinds({ ...snapshot, holds: [hold('r1', { validUntil: hours(48), replacementStarted: true })] })).toEqual([])
    expect(kinds({ ...snapshot, holds: [hold('r1', { validUntil: hours(80) })] })).toEqual([])
  })

  it('see a hold at risk for more than an hour, and offer an invoice or a message', () => {
    const snapshot = { ...empty, rentals: [rental('r1')], holds: [hold('r1', { state: 'at_risk', stateChangedAt: hours(-2) })] }
    expect(detectExceptions(snapshot)).toEqual([expect.objectContaining({ kind: 'hold_at_risk', allowed: ['send_invoice', 'send_message'] })])
    expect(kinds({ ...snapshot, holds: [hold('r1', { state: 'at_risk', stateChangedAt: hours(-0.5) })] })).toEqual([])
  })

  it('send a reminder by itself for an overdue return, and propose nothing', () => {
    const snapshot = { ...empty, rentals: [rental('r1', 'out', hours(-1))], holds: [hold('r1')] }
    expect(detectExceptions(snapshot)).toEqual([expect.objectContaining({ kind: 'return_overdue', allowed: [], reminder: 'return_due' })])
    expect(kinds({ ...snapshot, rentals: [rental('r1', 'returned', hours(-1))] })).toEqual([])
  })

  it('remind a renter whose reply to a claim is due within a day', () => {
    const snapshot = { ...empty, rentals: [rental('r1', 'settling')], holds: [hold('r1')], claims: [{ id: 'c1', rentalId: 'r1', state: 'presented', totalCents: 3500, currency: 'CHF', replyDueAt: hours(20) }] }
    expect(detectExceptions(snapshot)).toEqual([expect.objectContaining({ kind: 'claim_reply_due', reminder: 'reply_due', deadline: hours(20) })])
    expect(kinds({ ...snapshot, claims: [{ id: 'c1', rentalId: 'r1', state: 'presented', totalCents: 3500, currency: 'CHF', replyDueAt: hours(30) }] })).toEqual([])
  })

  it('see a decided claim larger than the hold with no invoice yet', () => {
    const snapshot = { ...empty, rentals: [rental('r1', 'settling')], holds: [hold('r1', { state: 'captured' })], claims: [{ id: 'c1', rentalId: 'r1', state: 'charged', totalCents: 45000, currency: 'CHF', replyDueAt: null }] }
    expect(detectExceptions(snapshot)).toEqual([expect.objectContaining({ kind: 'balance_above_hold', subjectKind: 'claim', allowed: ['send_invoice'], moneyCents: 15000 })])
    expect(kinds({ ...snapshot, invoices: [{ id: 'i1', claimId: 'c1', rentalId: 'r1', state: 'sent', amountCents: 15000, sentAt: hours(-1) }] })).toEqual([])
  })

  it('see a failed capture and offer an invoice, then a release', () => {
    const snapshot = { ...empty, rentals: [rental('r1', 'settling')], holds: [hold('r1', { state: 'capture_failed' })] }
    expect(detectExceptions(snapshot)).toEqual([expect.objectContaining({ kind: 'capture_failed', allowed: ['send_invoice', 'release_hold'] })])
  })

  it('remind about an invoice unpaid for longer than the shop allows', () => {
    const snapshot = { ...empty, rentals: [rental('r1', 'settling')], invoices: [{ id: 'i1', claimId: 'c1', rentalId: 'r1', state: 'sent', amountCents: 5000, sentAt: hours(-24 * 8) }] }
    expect(detectExceptions(snapshot)).toEqual([expect.objectContaining({ kind: 'invoice_unpaid', reminder: 'invoice' })])
    expect(kinds({ ...snapshot, invoices: [{ id: 'i1', claimId: 'c1', rentalId: 'r1', state: 'paid', amountCents: 5000, sentAt: hours(-24 * 8) }] })).toEqual([])
  })

  it('see an open dispute with a due date and no response', () => {
    const snapshot = { ...empty, disputes: [{ id: 'PP-D-1', rentalId: 'r1', state: 'open', amountCents: 3500, responseDueAt: hours(72), respondedAt: null }] }
    expect(detectExceptions(snapshot)).toEqual([expect.objectContaining({ kind: 'dispute_open', subjectKind: 'dispute', allowed: ['respond_to_dispute'], deadline: hours(72) })])
    expect(kinds({ ...snapshot, disputes: [{ id: 'PP-D-1', rentalId: 'r1', state: 'open', amountCents: 3500, responseDueAt: hours(72), respondedAt: hours(-1) }] })).toEqual([])
  })

  it('note an incident left waiting, and a difference the reconciliation could not apply', () => {
    const snapshot = { ...empty, incidents: [{ id: 'inc1', rentalId: 'r1', waitingSince: hours(-3) }], differences: [{ id: 'd1', subjectKind: 'hold', subjectId: 'hold-r1', rentalId: 'r1' }] }
    expect(detectExceptions(snapshot).map((each) => [each.kind, each.allowed])).toEqual([['incident_waiting', ['note']], ['reconciliation_difference', ['note']]])
  })

  it('names each exception the same way on every run, so nothing is written twice', () => {
    const snapshot = { ...empty, rentals: [rental('r1')], holds: [hold('r1', { validUntil: hours(48) })] }
    expect(detectExceptions(snapshot)[0]?.fingerprint).toBe(detectExceptions(snapshot)[0]?.fingerprint)
    expect(detectExceptions({ ...snapshot, holds: [hold('r1', { validUntil: hours(50) })] })[0]?.fingerprint).not.toBe(detectExceptions(snapshot)[0]?.fingerprint)
  })

  it('raises one exception for each overdue rental, and none for the rest', () => {
    fc.assert(fc.property(fc.array(fc.record({ late: fc.boolean(), state: fc.constantFrom('out', 'returned', 'closed') }), { maxLength: 20 }), (rows) => {
      const snapshot = { ...empty, rentals: rows.map((row, index) => rental(`r${String(index)}`, row.state, hours(row.late ? -1 : 5))) }
      expect(kinds(snapshot).filter((kind) => kind === 'return_overdue')).toHaveLength(rows.filter((row) => row.late && row.state === 'out').length)
    }))
  })

  it('knows every kind it can raise', () => {
    expect(DETECTOR_KINDS).toHaveLength(11)
  })
})

describe('the morning queue', () => {
  it('puts the nearest deadline first, then the most money', () => {
    const queue = orderQueue([
      { id: 'a', deadline: null, moneyCents: 50000 },
      { id: 'b', deadline: hours(10), moneyCents: 100 },
      { id: 'c', deadline: hours(2), moneyCents: 100 },
      { id: 'd', deadline: null, moneyCents: 90000 },
    ])
    expect(queue.map((each) => each.id)).toEqual(['c', 'b', 'd', 'a'])
  })
})

describe('automatic reminders', () => {
  it('send at most one of each kind to a renter a day, and none the shop switched off', () => {
    expect(reminderAllowed({ kind: 'return_due', renterId: 'p1', sentToday: [], switchedOff: [] })).toBe(true)
    expect(reminderAllowed({ kind: 'return_due', renterId: 'p1', sentToday: [{ kind: 'return_due', renterId: 'p1' }], switchedOff: [] })).toBe(false)
    expect(reminderAllowed({ kind: 'return_due', renterId: 'p1', sentToday: [{ kind: 'reply_due', renterId: 'p1' }], switchedOff: [] })).toBe(true)
    expect(reminderAllowed({ kind: 'invoice', renterId: 'p1', sentToday: [], switchedOff: ['invoice'] })).toBe(false)
  })
})

describe('the owner\'s rules', () => {
  it('keep a confirmed rule from proposing again', () => {
    expect(suppressedByRule([{ kind: 'never', proposalKind: 'send_message' }], { proposalKind: 'send_message', moneyCents: 0 })).toBe(true)
    expect(suppressedByRule([{ kind: 'below_amount', proposalKind: 'send_invoice', cents: 1000 }], { proposalKind: 'send_invoice', moneyCents: 900 })).toBe(true)
    expect(suppressedByRule([{ kind: 'below_amount', proposalKind: 'send_invoice', cents: 1000 }], { proposalKind: 'send_invoice', moneyCents: 1500 })).toBe(false)
    expect(suppressedByRule([], { proposalKind: 'release_hold', moneyCents: 30000 })).toBe(false)
  })
})
