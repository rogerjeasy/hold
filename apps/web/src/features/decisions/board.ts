import type { DecisionClaim, DecisionClaimLine, DecisionRecords, ExtensionAttention, ExtensionPaymentToCheck, OpenRepair, QueueEntry, ShopIncident, WaitingDropOff } from '@hold/db'
import { DETECTOR_KINDS, holdDay, holdStanding, mayConfirm, money, promiseStanding, proposalMovesMoney, settle } from '@hold/domain'
import type { ApprovalAction, DetectorKind, ProposalKind, StaffRole } from '@hold/domain'
import type { ContestView } from '@/features/contest/contest-summary-panel'
import { entryMarks } from '@/features/operations/entry-marks'
import type { EntryMark } from '@/features/operations/entry-marks'

// The decision board (extensions.md section 12.5): every record that waits on a person, as one row each. What a row
// asks, who may decide it from where the viewer stands, and when it falls due are read here from the records and the
// domain's rules; the screen only shows them. Nothing here decides anything.

export type Viewer = { readonly userId: string; readonly role: StaffRole; readonly approvalLimitCents: number }

// The board's filters: a claim, what the operations agent proposes, what a renter reported, and the counter's own.
export const BOARD_GROUPS = ['claims', 'agent', 'incidents', 'counter'] as const
export type BoardGroup = (typeof BOARD_GROUPS)[number]

// Who decides, as the viewer reads it: they do; an owner or manager does; another owner or manager does, because the
// viewer raised the claim; or the shop's staff do, for a viewer who may only read.
// Once the shop missed the date it promised the renter, the owner alone decides (architecture.md section 6.16).
export type Decider = 'you' | 'senior' | 'another_senior' | 'owner' | 'staff'

export type ProposalMark = EntryMark

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
  // The neutral summary of what the renter contests, with the facts code found (architecture.md section 6.15).
  readonly contest: ContestView | null
  // Where the shop's promise to decide stands, once the renter contested.
  readonly promise: 'open' | 'missed' | null
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
  // The model whose answer the entry carries, named by its marks; null for the detector's fixed reason.
  readonly model: string | null
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

// An item a renter dropped off with nobody at the counter: its hold stays until a person has seen it.
export type DropOffRow = Common & {
  readonly rentalId: string
  readonly kind: 'dropped_off'
  readonly group: 'counter'
  readonly droppedOffAt: Date
  readonly onTime: boolean
  readonly missingAt: Date | null
  readonly missingBy: string | null
  readonly items: WaitingDropOff['items']
}

// Money PayPal moved for extra days that Hold did not apply as quoted (architecture.md section 6.14): the amount is
// PayPal's. An owner or manager looks in PayPal and marks it checked.
export type ExtensionPaymentRow = Common & {
  readonly rentalId: string
  readonly kind: 'extension_payment'
  readonly group: 'counter'
  readonly extensionId: string
  readonly attention: ExtensionAttention
  readonly quotedCents: number
  readonly extraDays: number
  readonly paypalCaptureId: string
}

// A repair still to do (architecture.md section 9.6): any staff member photographs and closes it from the passport.
export type RepairRow = Common & { readonly kind: 'repair'; readonly group: 'counter'; readonly repairId: string; readonly itemId: string; readonly itemLabel: string }

export type BoardRow = ClaimRow | ProposalRow | IncidentRow | HoldEndingRow | LateRow | DropOffRow | ExtensionPaymentRow | RepairRow
export type BoardKind = BoardRow['kind']

const SENIOR: readonly StaffRole[] = ['owner', 'manager']
// A hold the agent already proposes to release or replace shows once, as that proposal.
const HOLD_PROPOSALS: readonly ProposalKind[] = ['release_hold', 'request_replacement_hold']

const isDetector = (kind: string | undefined): kind is DetectorKind => DETECTOR_KINDS.some((each) => each === kind)

function claimDecider(viewer: Viewer, claim: DecisionClaim, staffCount: number, promiseMissed: boolean): Decider {
  if (viewer.role === 'read_only') return 'staff'
  const action: ApprovalAction = claim.state === 'awaiting_approval'
    ? { kind: 'approve_claim', total: money(claim.totalCents, claim.currency) }
    : { kind: 'decide_contested_claim', raisedBy: claim.raisedByUserId ?? '', shopStaffCount: staffCount, promiseMissed }
  const allowed = mayConfirm({ staffId: viewer.userId, role: viewer.role, approvalLimit: money(viewer.approvalLimitCents, claim.currency) }, action)
  if (allowed.ok) return 'you'
  if (allowed.error.kind === 'owner_decides_after_promise') return 'owner'
  return allowed.error.kind === 'raised_the_claim' ? 'another_senior' : 'senior'
}

const staffDecider = (viewer: Viewer): Decider => (viewer.role === 'read_only' ? 'staff' : 'you')
// What only an owner or manager decides.
const seniorDecider = (viewer: Viewer): Decider => (SENIOR.includes(viewer.role) ? 'you' : viewer.role === 'read_only' ? 'staff' : 'senior')

const overdue = (due: Date | null, now: Date) => due !== null && due < now

function claimRow(claim: DecisionClaim, viewer: Viewer, staffCount: number, now: Date, contest: ContestView | undefined): ClaimRow {
  const split = claim.reservedCents === null ? null : settle(money(claim.totalCents, claim.currency), money(claim.reservedCents, claim.currency))
  const standing = promiseStanding({ decideBy: claim.decideBy, decidedAt: null, promiseMissedAt: claim.promiseMissedAt }, now)
  const promise = standing === 'open' || standing === 'missed' ? standing : null
  // The promise is the date the shop owes the renter; without one, the hold's end is the date that matters.
  const due = claim.decideBy ?? claim.holdValidUntil
  return {
    id: `claim:${claim.claimId}`,
    kind: claim.state === 'awaiting_approval' ? 'claim' : claim.state,
    group: 'claims',
    claimId: claim.claimId,
    rentalId: claim.rentalId,
    renterName: claim.renterName,
    due,
    overdue: overdue(due, now),
    waitingSince: claim.createdAt,
    amountCents: claim.totalCents,
    simulated: claim.simulated,
    decider: claimDecider(viewer, claim, staffCount, promise === 'missed'),
    selectable: false,
    lines: claim.lines,
    renterComment: claim.renterComment,
    settlement: split === null ? null : { captureCents: split.capture.cents, releaseCents: split.release.cents, invoiceCents: split.invoice.cents },
    contest: contest ?? null,
    promise,
  }
}

function proposalRow(entry: QueueEntry, viewer: Viewer, now: Date): ProposalRow {
  const decider = seniorDecider(viewer)
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
    marks: entryMarks(entry),
    model: entry.model,
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

function dropOffRow(dropOff: WaitingDropOff, viewer: Viewer): DropOffRow {
  return {
    id: `drop:${dropOff.rentalId}`,
    kind: 'dropped_off',
    group: 'counter',
    rentalId: dropOff.rentalId,
    renterName: dropOff.renterName,
    due: null,
    overdue: false,
    waitingSince: dropOff.droppedOffAt,
    amountCents: dropOff.holdCents,
    simulated: dropOff.simulated,
    decider: staffDecider(viewer),
    selectable: false,
    droppedOffAt: dropOff.droppedOffAt,
    onTime: dropOff.onTime,
    missingAt: dropOff.missingAt,
    missingBy: dropOff.missingBy,
    items: dropOff.items,
  }
}

function extensionPaymentRow(payment: ExtensionPaymentToCheck, viewer: Viewer): ExtensionPaymentRow {
  return {
    id: `extension:${payment.extensionId}`,
    kind: 'extension_payment',
    group: 'counter',
    rentalId: payment.rentalId,
    renterName: payment.renterName,
    due: null,
    overdue: false,
    waitingSince: payment.attentionAt,
    amountCents: payment.capturedCents,
    simulated: payment.simulated,
    decider: seniorDecider(viewer),
    selectable: false,
    extensionId: payment.extensionId,
    attention: payment.attention,
    quotedCents: payment.quotedCents,
    extraDays: payment.extraDays,
    paypalCaptureId: payment.paypalCaptureId,
  }
}

function repairRow(repair: OpenRepair, viewer: Viewer): RepairRow {
  return {
    id: `repair:${repair.id}`,
    kind: 'repair',
    group: 'counter',
    rentalId: null,
    renterName: repair.renterName,
    due: null,
    overdue: false,
    waitingSince: repair.createdAt,
    amountCents: repair.claimedCents > 0 ? repair.claimedCents : null,
    simulated: repair.simulated,
    decider: staffDecider(viewer),
    selectable: false,
    repairId: repair.id,
    itemId: repair.itemId,
    itemLabel: repair.itemLabel,
  }
}

const time = (date: Date | null) => (date === null ? Number.POSITIVE_INFINITY : date.getTime())

// What falls due first comes first, a return already missed before anything; then what has no date, the oldest first.
function byUrgency(first: BoardRow, second: BoardRow): number {
  return time(first.due) - time(second.due) || time(first.waitingSince) - time(second.waitingSince) || first.id.localeCompare(second.id)
}

// The contest summaries come keyed by claim, for the contested claims among the records.
export function boardRows(records: DecisionRecords, viewer: Viewer, now: Date, contests: Readonly<Record<string, ContestView>> = {}): BoardRow[] {
  const proposedHolds = new Set(records.proposals.filter((entry) => HOLD_PROPOSALS.includes(entry.kind)).flatMap((entry) => (entry.rentalId === null ? [] : [entry.rentalId])))
  const rows: BoardRow[] = [
    ...records.claims.map((claim) => claimRow(claim, viewer, records.staffCount, now, contests[claim.claimId])),
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
    ...records.dropOffs.map((dropOff) => dropOffRow(dropOff, viewer)),
    ...records.extensionPayments.map((payment) => extensionPaymentRow(payment, viewer)),
    ...records.repairs.map((repair) => repairRow(repair, viewer)),
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
