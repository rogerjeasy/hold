import { cleanRecord } from './clean-record.ts'
import type { StoredOutcome } from './clean-record.ts'
import { money } from './money.ts'
import type { Money } from './money.ts'
import { rentalHoldFor } from './trust-ladder.ts'
import type { ItemHold, RentalLadderHold, TrustLadder } from './trust-ladder.ts'

// Helping an owner set a ladder (extensions.md section 7.8): a candidate ladder replayed over the shop's own past
// rentals, in plain code. Each rental's hold is worked out from the renter's returns that closed before it began.

export type PastRental = {
  // Opaque, the same for the same renter.
  readonly renter: string
  readonly startsAt: Date
  // When its outcome was known. A rental still open has none.
  readonly closedAt: Date
  readonly outcome: StoredOutcome
  readonly counts: boolean
  readonly items: readonly ItemHold[]
  // What its claim asked for, or zero.
  readonly claimCents: number
}

export type LadderSimulation = {
  readonly rentals: number
  // Rentals whose hold the ladder would have lowered, and by how much in all.
  readonly lowered: number
  readonly loweredBy: Money
  // Past claims a lowered hold would not have covered, and the part of them, up to the ordinary hold, left to invoice.
  readonly claimsAboveLoweredHold: number
  readonly uncovered: Money
  readonly rows: readonly RentalLadderHold[]
}

export function simulateLadder(ladder: TrustLadder, past: readonly PastRental[]): LadderSimulation {
  const rows = past.map((rental) => {
    const earlier = past
      .filter((other) => other.renter === rental.renter && other.closedAt.getTime() < rental.startsAt.getTime())
      .map((other) => ({ outcome: other.outcome, closedAt: other.closedAt, counts: other.counts, unpaidAfter: null, shop: 'here' }))
    return { rental, hold: rentalHoldFor(rental.items, ladder, cleanRecord(earlier, ladder.windowMonths, rental.startsAt)) }
  })
  let lowered = 0
  let loweredBy = 0
  let above = 0
  let uncovered = 0
  for (const { rental, hold } of rows) {
    if (hold.amount.cents >= hold.ordinary.cents) continue
    lowered += 1
    loweredBy += hold.ordinary.cents - hold.amount.cents
    if (rental.claimCents > hold.amount.cents) {
      above += 1
      uncovered += Math.min(rental.claimCents, hold.ordinary.cents) - hold.amount.cents
    }
  }
  return {
    rentals: past.length,
    lowered,
    loweredBy: money(loweredBy, ladder.currency),
    claimsAboveLoweredHold: above,
    uncovered: money(uncovered, ladder.currency),
    rows: rows.map((row) => row.hold),
  }
}
