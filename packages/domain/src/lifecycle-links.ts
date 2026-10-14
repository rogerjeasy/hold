import type { ClaimState } from './claim.ts'
import type { HoldState } from './hold.ts'

// How the rental, hold and claim machines constrain each other. architecture.md section 7.1, "How they connect".

const HOLD_STATES_A_RENTAL_MAY_CLOSE_WITH: ReadonlySet<HoldState> = new Set(['released', 'captured', 'invoiced', 'expired'])

export function mayHandOver(hold: HoldState): boolean {
  return hold === 'placed'
}

export function mayCapture(claim: ClaimState): boolean {
  return claim === 'charging'
}

export function mayCloseRental(hold: HoldState): boolean {
  return HOLD_STATES_A_RENTAL_MAY_CLOSE_WITH.has(hold)
}
