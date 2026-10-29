import { holdDay, holdStanding } from '@hold/domain'
import type { ActiveHold, ShopToday } from '@hold/db'

// What needs a person today, most urgent first: an item a renter left at the drop point, a claim waits on them, a hold
// will lapse, a rental is late, and a renter has answered a claim. The standing of each hold comes from the domain.

type Common = { readonly key: string; readonly rentalId: string; readonly renterName: string | null; readonly simulated: boolean }

export type Decision =
  | (Common & { readonly kind: 'dropped_off'; readonly droppedOffAt: Date })
  | (Common & { readonly kind: 'claim'; readonly totalCents: number; readonly firstLine: string | null })
  | (Common & { readonly kind: 'hold_ending'; readonly reservedCents: number; readonly day: number; readonly validUntil: Date })
  | (Common & { readonly kind: 'late'; readonly endsAt: Date })
  | (Common & { readonly kind: 'contested'; readonly totalCents: number; readonly renterComment: string | null })

export function decisionsFor(today: Pick<ShopToday, 'claimsWaiting' | 'activeHolds' | 'late' | 'droppedOff'>, now: Date): Decision[] {
  const claims = today.claimsWaiting
  return [
    ...today.droppedOff.map((rental): Decision => ({ kind: 'dropped_off', key: rental.rentalId, rentalId: rental.rentalId, renterName: rental.renterName, simulated: rental.simulated, droppedOffAt: rental.droppedOffAt })),
    ...claims
      .filter((claim) => claim.state === 'awaiting_approval')
      .map((claim): Decision => ({ kind: 'claim', key: claim.claimId, rentalId: claim.rentalId, renterName: claim.renterName, simulated: claim.simulated, totalCents: claim.totalCents, firstLine: claim.firstLine })),
    ...today.activeHolds
      .filter((hold) => holdStanding(hold, now) === 'ending')
      .map((hold): Decision => ({
        kind: 'hold_ending',
        key: hold.rentalId,
        rentalId: hold.rentalId,
        renterName: hold.renterName,
        simulated: hold.simulated,
        reservedCents: hold.reservedCents,
        day: holdDay(hold, now),
        validUntil: hold.validUntil,
      })),
    ...today.late.map((rental): Decision => ({ kind: 'late', key: rental.rentalId, rentalId: rental.rentalId, renterName: rental.renterName, simulated: rental.simulated, endsAt: rental.endsAt })),
    ...claims
      .filter((claim) => claim.state === 'contested')
      .map((claim): Decision => ({ kind: 'contested', key: claim.claimId, rentalId: claim.rentalId, renterName: claim.renterName, simulated: claim.simulated, totalCents: claim.totalCents, renterComment: claim.renterComment })),
  ]
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
