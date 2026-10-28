import type { DecisionClaim, DecisionClaimLine, DecisionRecords, QueueEntry, ShopIncident } from '@hold/db'
import { DETECTOR_KINDS, holdDay, holdStanding, mayConfirm, money, proposalMovesMoney, settle } from '@hold/domain'
import type { ApprovalAction, DetectorKind, ProposalKind, StaffRole } from '@hold/domain'

// The decision board (extensions.md section 12.5): every record that waits on a person, as one row each. What a row
// asks, who may decide it from where the viewer stands, and when it falls due are read here from the records and the
// domain's rules; the screen only shows them. Nothing here decides anything.

export type Viewer = { readonly userId: string; readonly role: StaffRole; readonly approvalLimitCents: number }

// The board's filters: a claim, what the operations agent proposes, what a renter reported, and the counter's own.
export const BOARD_GROUPS = ['claims', 'agent', 'incidents', 'counter'] as const
export type BoardGroup = (typeof BOARD_GROUPS)[number]

// Who decides, as the viewer reads it: they do; an owner or manager does; another owner or manager does, because the
// viewer raised the claim; or the shop's staff do, for a viewer who may only read.
export type Decider = 'you' | 'senior' | 'another_senior' | 'staff'

export type ProposalMark = 'raisedByAgent' | 'notInvestigated' | 'paypalNotChecked' | 'draftDropped'

type Common = {
  readonly id: string
  readonly rentalId: string | null
  readonly renterName: string | null
  // When the decision must be made by: a hold's end, a deadline, or a return already missed.
  readonly due: Date | null
  // Its date has passed. Worked out on the server, so the page and the browser never disagree about now.
  readonly overdue: boolean
  readonly waitingSince: Date | null
  readonly amountCents: number | null
  readonly simulated: boolean
  readonly decider: Decider
  // Only releases may be approved together, and only by someone who may approve them.
  readonly selectable: boolean
}

export type ClaimRow = Common & {
  readonly kind: 'claim' | 'contested' | 'escalated'
  readonly group: 'claims'
  readonly claimId: string
  readonly lines: readonly DecisionClaimLine[]
  readonly renterComment: string | null
  readonly settlement: { readonly captureCents: number; readonly releaseCents: number; readonly invoiceCents: number } | null
}

export type ProposalRow = Common & {
  readonly kind: 'proposal'
  readonly group: 'agent'
  readonly proposalId: string
  readonly proposalKind: ProposalKind
  readonly movesMoney: boolean
  // The detector's fixed reason, when the agent did not write one; otherwise the agent's own, shown as text.
  readonly fixedReason: DetectorKind | null
  readonly reason: string
  readonly references: readonly string[]
  readonly draft: string | null
  readonly marks: readonly ProposalMark[]
}

export type IncidentRow = Common & {
  readonly kind: 'incident'
  readonly group: 'incidents'
  readonly incidentId: string
  readonly incidentKind: ShopIncident['kind']
  readonly itemLabel: string
  // The renter's own words: quoted data, never acted on.
  readonly description: string
  readonly safety: boolean
  readonly suggestion: string | null
}

export type HoldEndingRow = Common & { readonly kind: 'hold_ending'; readonly group: 'counter'; readonly day: number; readonly validUntil: Date }
export type LateRow = Common & { readonly kind: 'late'; readonly group: 'counter'; readonly endsAt: Date }

export type BoardRow = ClaimRow | ProposalRow | IncidentRow | HoldEndingRow | LateRow
export type BoardKind = BoardRow['kind']

const SENIOR: readonly StaffRole[] = ['owner', 'manager']
// A hold the agent already proposes to release or replace shows once, as that proposal.
const HOLD_PROPOSALS: readonly ProposalKind[] = ['release_hold', 'request_replacement_hold']

const isDetector = (kind: string | undefined): kind is DetectorKind => DETECTOR_KINDS.some((each) => each === kind)

function claimDecider(viewer: Viewer, claim: DecisionClaim, staffCount: number): Decider {
  if (viewer.role === 'read_only') return 'staff'
  const action: ApprovalAction = claim.state === 'awaiting_approval'
    ? { kind: 'approve_claim', total: money(claim.totalCents, claim.currency) }
    : { kind: 'decide_contested_claim', raisedBy: claim.raisedByUserId ?? '', shopStaffCount: staffCount }
  const allowed = mayConfirm({ staffId: viewer.userId, role: viewer.role, approvalLimit: money(viewer.approvalLimitCents, claim.currency) }, action)
  if (allowed.ok) return 'you'
  return allowed.error.kind === 'raised_the_claim' ? 'another_senior' : 'senior'
}

const staffDecider = (viewer: Viewer): Decider => (viewer.role === 'read_only' ? 'staff' : 'you')

const overdue = (due: Date | null, now: Date) => due !== null && due < now

function claimRow(claim: DecisionClaim, viewer: Viewer, staffCount: number, now: Date): ClaimRow {
  const split = claim.reservedCents === null ? null : settle(money(claim.totalCents, claim.currency), money(claim.reservedCents, claim.currency))
  return {
    id: `claim:${claim.claimId}`,
    kind: claim.state === 'awaiting_approval' ? 'claim' : claim.state,
    group: 'claims',
    claimId: claim.claimId,
    rentalId: claim.rentalId,
    renterName: claim.renterName,
    due: claim.holdValidUntil,
    overdue: overdue(claim.holdValidUntil, now),
    waitingSince: claim.createdAt,
    amountCents: claim.totalCents,
    simulated: claim.simulated,
    decider: claimDecider(viewer, claim, staffCount),
    selectable: false,
    lines: claim.lines,
    renterComment: claim.renterComment,
    settlement: split === null ? null : { captureCents: split.capture.cents, releaseCents: split.release.cents, invoiceCents: split.invoice.cents },
  }
}

function proposalRow(entry: QueueEntry, viewer: Viewer, now: Date): ProposalRow {
  const decider: Decider = SENIOR.includes(viewer.role) ? 'you' : viewer.role === 'read_only' ? 'staff' : 'senior'
  const marks: ProposalMark[] = []
  if (entry.raisedByAgent) marks.push('raisedByAgent')
  if (entry.payload['investigated'] === 'no') marks.push('notInvestigated')
  if (entry.payload['paypalChecked'] === 'no') marks.push('paypalNotChecked')
  if (entry.payload['draftDropped'] === 'yes') marks.push('draftDropped')
  const fixed = entry.payload['fixedReason']
  return {
    id: `proposal:${entry.id}`,
    kind: 'proposal',
    group: 'agent',
    proposalId: entry.id,
    proposalKind: entry.kind,
    movesMoney: proposalMovesMoney(entry.kind),
    rentalId: entry.rentalId,
    renterName: null,
    due: entry.deadline,
    overdue: overdue(entry.deadline, now),
    waitingSince: null,
    amountCents: entry.amountCents,
    simulated: entry.payload['simulated'] === 'yes',
    decider,
    selectable: entry.kind === 'release_hold' && decider === 'you',
    fixedReason: isDetector(fixed) ? fixed : null,
    reason: entry.reason,
    references: entry.references,
    draft: entry.draft,
    marks,
  }
}

function incidentRow(incident: ShopIncident, viewer: Viewer): IncidentRow {
  return {
    id: `incident:${incident.id}`,
    kind: 'incident',
    group: 'incidents',
    incidentId: incident.id,
    incidentKind: incident.kind,
    rentalId: incident.rentalId,
    renterName: incident.renterName,
    due: null,
    overdue: false,
    waitingSince: incident.reportedAt,
    amountCents: incident.agreedCents ?? incident.offer?.amountCents ?? incident.suggestion?.amountCents ?? null,
    simulated: incident.simulated,
    decider: staffDecider(viewer),
    selectable: false,
    itemLabel: incident.itemLabel,
    description: incident.description,
    safety: incident.safety,
    suggestion: incident.offer?.description ?? incident.suggestion?.description ?? null,
  }
}

const time = (date: Date | null) => (date === null ? Number.POSITIVE_INFINITY : date.getTime())

// What falls due first comes first, a return already missed before anything; then what has no date, the oldest first.
function byUrgency(first: BoardRow, second: BoardRow): number {
  return time(first.due) - time(second.due) || time(first.waitingSince) - time(second.waitingSince) || first.id.localeCompare(second.id)
}

export function boardRows(records: DecisionRecords, viewer: Viewer, now: Date): BoardRow[] {
  const proposedHolds = new Set(records.proposals.filter((entry) => HOLD_PROPOSALS.includes(entry.kind)).flatMap((entry) => (entry.rentalId === null ? [] : [entry.rentalId])))
  const rows: BoardRow[] = [
    ...records.claims.map((claim) => claimRow(claim, viewer, records.staffCount, now)),
    ...records.proposals.map((entry) => proposalRow(entry, viewer, now)),
    ...records.incidents.map((incident) => incidentRow(incident, viewer)),
    ...records.holds
      .filter((hold) => holdStanding(hold, now) === 'ending' && !proposedHolds.has(hold.rentalId))
      .map((hold): HoldEndingRow => ({
        id: `hold:${hold.rentalId}`,
        kind: 'hold_ending',
        group: 'counter',
        rentalId: hold.rentalId,
        renterName: hold.renterName,
        due: hold.validUntil,
        overdue: overdue(hold.validUntil, now),
        waitingSince: null,
        amountCents: hold.reservedCents,
        simulated: hold.simulated,
        decider: staffDecider(viewer),
        selectable: false,
        day: holdDay(hold, now),
        validUntil: hold.validUntil,
      })),
    ...records.late.map((rental): LateRow => ({
      id: `late:${rental.rentalId}`,
      kind: 'late',
      group: 'counter',
      rentalId: rental.rentalId,
      renterName: rental.renterName,
      due: rental.endsAt,
      overdue: overdue(rental.endsAt, now),
      waitingSince: rental.endsAt,
      amountCents: null,
      simulated: rental.simulated,
      decider: staffDecider(viewer),
      selectable: false,
      endsAt: rental.endsAt,
    })),
  ]
  return rows.sort(byUrgency)
}

export type BoardBrief = { readonly decisions: number; readonly yours: number; readonly dueToday: number }

export function boardBrief(rows: readonly BoardRow[], endOfShopDay: Date): BoardBrief {
  return {
    decisions: rows.length,
    yours: rows.filter((row) => row.decider === 'you').length,
    dueToday: rows.filter((row) => row.due !== null && row.due < endOfShopDay).length,
  }
}

export type GroupFilter = 'all' | BoardGroup

export function groupCounts(rows: readonly BoardRow[]): Readonly<Record<GroupFilter, number>> {
  const counts = { all: rows.length, claims: 0, agent: 0, incidents: 0, counter: 0 }
  for (const row of rows) counts[row.group] += 1
  return counts
}

export type BoardView = { readonly group: GroupFilter; readonly search: string; readonly mineOnly: boolean }

// The rows the viewer asked to see, for the grid and the list on a phone alike. A search keeps the rows whose text,
// as the screen words it, holds every word typed, in any case.
export function visibleRows<Row extends BoardRow>(rows: readonly Row[], view: BoardView, textOf: (row: Row) => string): Row[] {
  const words = view.search.toLocaleLowerCase().split(/\s+/).filter((word) => word !== '')
  return rows.filter((row) => {
    if (view.group !== 'all' && row.group !== view.group) return false
    if (view.mineOnly && row.decider !== 'you') return false
    if (words.length === 0) return true
    const text = textOf(row).toLocaleLowerCase()
    return words.every((word) => text.includes(word))
  })
}
