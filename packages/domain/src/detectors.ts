import type { ProposalKind } from './proposal.ts'

// What needs the owner's attention, decided by plain code over the shop's records (extensions.md section 6.3, step 1).
// This is the complete list: the operations agent investigates each exception, but cannot shorten the list.
export const DETECTOR_KINDS = [
  'clean_return_unconfirmed',
  'hold_ending',
  'hold_at_risk',
  'return_overdue',
  'claim_reply_due',
  'balance_above_hold',
  'capture_failed',
  'invoice_unpaid',
  'dispute_open',
  'incident_waiting',
  'reconciliation_difference',
] as const
export type DetectorKind = (typeof DETECTOR_KINDS)[number]

// What each detector allows a person to be asked to approve (section 6.3, the table in step 1).
export const DETECTOR_PROPOSALS: Readonly<Record<DetectorKind, readonly ProposalKind[]>> = {
  clean_return_unconfirmed: ['release_hold'],
  hold_ending: ['request_replacement_hold'],
  hold_at_risk: ['send_invoice', 'send_message'],
  return_overdue: [],
  claim_reply_due: [],
  balance_above_hold: ['send_invoice'],
  capture_failed: ['send_invoice', 'release_hold'],
  invoice_unpaid: [],
  dispute_open: ['respond_to_dispute'],
  incident_waiting: ['note'],
  reconciliation_difference: ['note'],
}

// Fixed-template messages that move no money, sent without asking (section 6.4).
export const REMINDER_KINDS = ['return_due', 'reply_due', 'invoice'] as const
export type ReminderKind = (typeof REMINDER_KINDS)[number]

export type ShopSnapshot = {
  readonly now: Date
  readonly settings: { readonly confirmCleanWithinHours: number; readonly invoiceUnpaidDays: number; readonly incidentWaitHours: number }
  readonly rentals: readonly { readonly id: string; readonly state: string; readonly endsAt: Date; readonly renterId: string | null }[]
  readonly holds: readonly { readonly id: string; readonly rentalId: string; readonly state: string; readonly reservedCents: number; readonly currency: string; readonly validUntil: Date | null; readonly stateChangedAt: Date; readonly replacementStarted: boolean }[]
  readonly comparisons: readonly { readonly rentalId: string; readonly state: string; readonly completedAt: Date | null; readonly simulated: boolean }[]
  readonly claims: readonly { readonly id: string; readonly rentalId: string; readonly state: string; readonly totalCents: number; readonly currency: string; readonly replyDueAt: Date | null }[]
  readonly invoices: readonly { readonly id: string; readonly claimId: string; readonly rentalId: string; readonly state: string; readonly amountCents: number; readonly sentAt: Date | null }[]
  // Read from PayPal by code. A dispute may name no rental Hold knows.
  readonly disputes: readonly { readonly id: string; readonly rentalId: string | null; readonly state: string; readonly amountCents: number; readonly responseDueAt: Date | null; readonly respondedAt: Date | null }[]
  readonly incidents: readonly { readonly id: string; readonly rentalId: string; readonly waitingSince: Date | null }[]
  readonly differences: readonly { readonly id: string; readonly subjectKind: string; readonly subjectId: string; readonly rentalId: string | null }[]
}

export type ShopException = {
  readonly kind: DetectorKind
  readonly subjectKind: 'hold' | 'rental' | 'claim' | 'invoice' | 'dispute' | 'incident' | 'difference'
  readonly subjectId: string
  readonly rentalId: string | null
  // The proposal kinds this detector allows. The agent chooses among them and can add no other.
  readonly allowed: readonly ProposalKind[]
  readonly reminder: ReminderKind | null
  readonly deadline: Date | null
  readonly moneyCents: number
  // The detector, its subject and the state it saw: a repeated run finds the same fingerprint and writes nothing.
  readonly fingerprint: string
}

const HOUR = 3_600_000
const OPEN_RENTALS = ['ready', 'out', 'overdue', 'dropped_off', 'returned', 'inspecting', 'settling']
const DECIDED_CLAIMS = ['accepted', 'lapsed', 'decided', 'agreed', 'charging', 'charged', 'charge_failed']
const HOLD_ENDING_WITHIN = 3 * 24 * HOUR
const AT_RISK_FOR = HOUR
const REPLY_DUE_WITHIN = 24 * HOUR

const exception = (fields: Omit<ShopException, 'fingerprint' | 'reminder' | 'deadline'> & { readonly reminder?: ReminderKind; readonly deadline?: Date | null; readonly seen: string }): ShopException => {
  const { seen, ...rest } = fields
  return { reminder: null, deadline: null, ...rest, fingerprint: `${fields.kind}:${fields.subjectId}:${seen}` }
}

export function detectExceptions(snapshot: ShopSnapshot): readonly ShopException[] {
  const { now, settings } = snapshot
  const at = now.getTime()
  const rentalOf = (id: string) => snapshot.rentals.find((rental) => rental.id === id)
  const holdOf = (rentalId: string) => snapshot.holds.find((hold) => hold.rentalId === rentalId)
  const found: ShopException[] = []
  for (const comparison of snapshot.comparisons) {
    const hold = holdOf(comparison.rentalId)
    const rental = rentalOf(comparison.rentalId)
    if (comparison.state !== 'clean' || comparison.simulated || comparison.completedAt === null || hold?.state !== 'placed' || rental === undefined || !['returned', 'inspecting'].includes(rental.state)) continue
    if (at - comparison.completedAt.getTime() <= settings.confirmCleanWithinHours * HOUR) continue
    found.push(exception({ kind: 'clean_return_unconfirmed', subjectKind: 'hold', subjectId: hold.id, rentalId: rental.id, allowed: DETECTOR_PROPOSALS.clean_return_unconfirmed, moneyCents: hold.reservedCents, seen: `${hold.state}:${comparison.completedAt.toISOString()}` }))
  }
  for (const hold of snapshot.holds) {
    const rental = rentalOf(hold.rentalId)
    if (rental === undefined || !OPEN_RENTALS.includes(rental.state)) continue
    if (hold.state === 'placed' && hold.validUntil !== null && !hold.replacementStarted && hold.validUntil.getTime() - at <= HOLD_ENDING_WITHIN) {
      found.push(exception({ kind: 'hold_ending', subjectKind: 'hold', subjectId: hold.id, rentalId: rental.id, allowed: DETECTOR_PROPOSALS.hold_ending, deadline: hold.validUntil, moneyCents: hold.reservedCents, seen: hold.validUntil.toISOString() }))
    }
    if (hold.state === 'at_risk' && at - hold.stateChangedAt.getTime() > AT_RISK_FOR) {
      found.push(exception({ kind: 'hold_at_risk', subjectKind: 'hold', subjectId: hold.id, rentalId: rental.id, allowed: DETECTOR_PROPOSALS.hold_at_risk, deadline: hold.validUntil, moneyCents: hold.reservedCents, seen: hold.stateChangedAt.toISOString() }))
    }
  }
  for (const rental of snapshot.rentals) {
    if (!['out', 'overdue'].includes(rental.state) || rental.endsAt.getTime() >= at) continue
    found.push(exception({ kind: 'return_overdue', subjectKind: 'rental', subjectId: rental.id, rentalId: rental.id, allowed: DETECTOR_PROPOSALS.return_overdue, reminder: 'return_due', deadline: rental.endsAt, moneyCents: holdOf(rental.id)?.reservedCents ?? 0, seen: rental.endsAt.toISOString() }))
  }
  for (const claim of snapshot.claims) {
    if (claim.state === 'presented' && claim.replyDueAt !== null && claim.replyDueAt.getTime() > at && claim.replyDueAt.getTime() - at <= REPLY_DUE_WITHIN) {
      found.push(exception({ kind: 'claim_reply_due', subjectKind: 'claim', subjectId: claim.id, rentalId: claim.rentalId, allowed: DETECTOR_PROPOSALS.claim_reply_due, reminder: 'reply_due', deadline: claim.replyDueAt, moneyCents: claim.totalCents, seen: claim.replyDueAt.toISOString() }))
    }
    const reserved = holdOf(claim.rentalId)?.reservedCents ?? 0
    if (DECIDED_CLAIMS.includes(claim.state) && claim.totalCents > reserved && !snapshot.invoices.some((invoice) => invoice.claimId === claim.id)) {
      found.push(exception({ kind: 'balance_above_hold', subjectKind: 'claim', subjectId: claim.id, rentalId: claim.rentalId, allowed: DETECTOR_PROPOSALS.balance_above_hold, moneyCents: claim.totalCents - reserved, seen: `${String(claim.totalCents)}:${String(reserved)}` }))
    }
  }
  for (const hold of snapshot.holds) {
    if (hold.state !== 'capture_failed') continue
    found.push(exception({ kind: 'capture_failed', subjectKind: 'hold', subjectId: hold.id, rentalId: hold.rentalId, allowed: DETECTOR_PROPOSALS.capture_failed, deadline: hold.validUntil, moneyCents: hold.reservedCents, seen: hold.stateChangedAt.toISOString() }))
  }
  for (const invoice of snapshot.invoices) {
    if (invoice.state !== 'sent' || invoice.sentAt === null || at - invoice.sentAt.getTime() <= settings.invoiceUnpaidDays * 24 * HOUR) continue
    found.push(exception({ kind: 'invoice_unpaid', subjectKind: 'invoice', subjectId: invoice.id, rentalId: invoice.rentalId, allowed: DETECTOR_PROPOSALS.invoice_unpaid, reminder: 'invoice', moneyCents: invoice.amountCents, seen: invoice.sentAt.toISOString() }))
  }
  for (const dispute of snapshot.disputes) {
    if (dispute.state !== 'open' || dispute.responseDueAt === null || dispute.respondedAt !== null) continue
    found.push(exception({ kind: 'dispute_open', subjectKind: 'dispute', subjectId: dispute.id, rentalId: dispute.rentalId, allowed: DETECTOR_PROPOSALS.dispute_open, deadline: dispute.responseDueAt, moneyCents: dispute.amountCents, seen: dispute.responseDueAt.toISOString() }))
  }
  for (const incident of snapshot.incidents) {
    if (incident.waitingSince === null || at - incident.waitingSince.getTime() <= settings.incidentWaitHours * HOUR) continue
    found.push(exception({ kind: 'incident_waiting', subjectKind: 'incident', subjectId: incident.id, rentalId: incident.rentalId, allowed: DETECTOR_PROPOSALS.incident_waiting, moneyCents: 0, seen: incident.waitingSince.toISOString() }))
  }
  for (const difference of snapshot.differences) {
    found.push(exception({ kind: 'reconciliation_difference', subjectKind: 'difference', subjectId: difference.id, rentalId: difference.rentalId, allowed: DETECTOR_PROPOSALS.reconciliation_difference, moneyCents: 0, seen: difference.subjectId }))
  }
  return found.sort((first, second) => DETECTOR_KINDS.indexOf(first.kind) - DETECTOR_KINDS.indexOf(second.kind))
}

// The nearest deadline first, then the most money at stake (section 6.3, step 4).
export function orderQueue<Entry extends { readonly deadline: Date | null; readonly moneyCents: number }>(entries: readonly Entry[]): Entry[] {
  return [...entries].sort((first, second) => {
    if (first.deadline !== null && second.deadline !== null && first.deadline.getTime() !== second.deadline.getTime()) return first.deadline.getTime() - second.deadline.getTime()
    if (first.deadline !== null && second.deadline === null) return -1
    if (first.deadline === null && second.deadline !== null) return 1
    return second.moneyCents - first.moneyCents
  })
}

// The sentence the morning brief opens with (section 6.3, step 4): how many decisions, and how many expire before the
// shop's day ends. One already past its deadline expires today too.
export function queueBrief(entries: readonly { readonly deadline: Date | null }[], endOfShopDay: Date): { readonly decisions: number; readonly expiringToday: number } {
  return { decisions: entries.length, expiringToday: entries.filter((entry) => entry.deadline !== null && entry.deadline < endOfShopDay).length }
}

// At most one reminder of each kind to a renter a day, and none of a kind the shop switched off.
export function reminderAllowed(input: { readonly kind: ReminderKind; readonly renterId: string; readonly sentToday: readonly { readonly kind: ReminderKind; readonly renterId: string }[]; readonly switchedOff: readonly ReminderKind[] }): boolean {
  return !input.switchedOff.includes(input.kind) && !input.sentToday.some((sent) => sent.kind === input.kind && sent.renterId === input.renterId)
}

// A rule the owner confirmed after rejecting a proposal (section 6.5). The agent's memory is this list and nothing else.
export type OwnerRule = { readonly kind: 'never'; readonly proposalKind: ProposalKind } | { readonly kind: 'below_amount'; readonly proposalKind: ProposalKind; readonly cents: number }

export function suppressedByRule(rules: readonly OwnerRule[], proposal: { readonly proposalKind: ProposalKind; readonly moneyCents: number }): boolean {
  return rules.some((rule) => rule.proposalKind === proposal.proposalKind && (rule.kind === 'never' || proposal.moneyCents < rule.cents))
}
