import { holdStanding } from '@hold/domain'
import type { ActiveHold } from '@hold/db'
import type { BoardRow } from '@/features/decisions/board'

// What needs a person today, most urgent first: an item a renter left at the drop point, a claim waits on them, a hold
// will lapse, a rental is late, and a renter has answered a claim; then the rest of what waits on the decision board.
// What waits on a person is the board's rule (boardRows), so Today counts what the board counts (audit finding JW-L3).

type Common = { readonly key: string; readonly rentalId: string; readonly renterName: string | null; readonly simulated: boolean }

export type Decision =
  | (Common & { readonly kind: 'dropped_off'; readonly droppedOffAt: Date })
  | (Common & { readonly kind: 'claim'; readonly totalCents: number; readonly firstLine: string | null })
  | (Common & { readonly kind: 'hold_ending'; readonly reservedCents: number; readonly day: number; readonly validUntil: Date })
  | (Common & { readonly kind: 'late'; readonly endsAt: Date })
  | (Common & { readonly kind: 'contested'; readonly totalCents: number; readonly renterComment: string | null })
  // Anything else the board holds, such as the agent's proposals, worded as the board words it.
  | { readonly kind: 'board'; readonly key: string; readonly renterName: string | null; readonly row: BoardRow; readonly simulated: boolean }

const ORDER: readonly Decision['kind'][] = ['dropped_off', 'claim', 'hold_ending', 'late', 'contested', 'board']

function decisionOf(row: BoardRow): Decision {
  const common = { key: row.id, renterName: row.renterName, simulated: row.simulated }
  const asOnBoard: Decision = { kind: 'board', key: row.id, renterName: row.renterName, row, simulated: row.simulated }
  if (row.rentalId === null) return asOnBoard
  switch (row.kind) {
    case 'dropped_off':
      return { ...common, kind: 'dropped_off', rentalId: row.rentalId, droppedOffAt: row.droppedOffAt }
    case 'claim':
      return { ...common, kind: 'claim', rentalId: row.rentalId, totalCents: row.amountCents ?? 0, firstLine: row.lines[0]?.description ?? null }
    case 'hold_ending':
      return { ...common, kind: 'hold_ending', rentalId: row.rentalId, reservedCents: row.amountCents ?? 0, day: row.day, validUntil: row.validUntil }
    case 'late':
      return { ...common, kind: 'late', rentalId: row.rentalId, endsAt: row.endsAt }
    case 'contested':
      return { ...common, kind: 'contested', rentalId: row.rentalId, totalCents: row.amountCents ?? 0, renterComment: row.renterComment }
    default:
      return asOnBoard
  }
}

// The board's rows come most urgent first; Today keeps that order within each kind.
export function decisionsFor(rows: readonly BoardRow[]): Decision[] {
  return rows.map(decisionOf).sort((first, second) => ORDER.indexOf(first.kind) - ORDER.indexOf(second.kind))
}

export type HoldSummary = { readonly heldCents: number; readonly count: number; readonly assured: number; readonly valid: number; readonly ending: number }

export function holdSummary(holds: readonly ActiveHold[], now: Date): HoldSummary {
  const standings = holds.map((hold) => holdStanding(hold, now))
  return {
    heldCents: holds.reduce((sum, hold) => sum + hold.reservedCents, 0),
    count: holds.length,
    assured: standings.filter((standing) => standing === 'assured').length,
    valid: standings.filter((standing) => standing === 'valid').length,
    ending: standings.filter((standing) => standing === 'ending').length,
  }
}
