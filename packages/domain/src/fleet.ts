// The fleet passport (extensions.md section 12.5): what each item's rentals say about it, read by plain code from its
// damage findings, the claim lines priced from them, and the money PayPal collected on each claim. No model is asked;
// the signal is a comparison of counts the comparison and the people deciding claims already recorded.

// One rental of one item, as the item's record holds it.
export type ItemRentalRecord = {
  readonly rentalId: string
  readonly startsAt: Date
  readonly endsAt: Date
  // New damage and missing parts the comparison found on this item at this rental's return.
  readonly damageFindings: number
  // The claim lines priced from those findings, on a claim a person has decided on.
  readonly claimLinesCents: number
  // The whole claim, and what PayPal collected on it: captured from the hold and paid by invoice, less refunds.
  readonly claimTotalCents: number | null
  readonly collectedCents: number
}

export type DateWindow = { readonly start: Date; readonly end: Date }

const DAY = 24 * 60 * 60 * 1000

// The days an item was out within a window, such as this year on the shop's clock. A part day counts as a whole one.
export function daysOut(rentals: readonly ItemRentalRecord[], window: DateWindow): number {
  return rentals.reduce((total, rental) => {
    const overlap = Math.min(rental.endsAt.getTime(), window.end.getTime()) - Math.max(rental.startsAt.getTime(), window.start.getTime())
    return total + (overlap > 0 ? Math.ceil(overlap / DAY) : 0)
  }, 0)
}

// The item's share of what was collected on its rental's claim: its lines' part of the claim, never more than its
// lines. A rental with no claim recovered nothing.
export function recoveredCents(rental: ItemRentalRecord): number {
  if (rental.claimTotalCents === null || rental.claimTotalCents <= 0 || rental.claimLinesCents <= 0) return 0
  const collected = Math.min(Math.max(rental.collectedCents, 0), rental.claimTotalCents)
  return Math.min(rental.claimLinesCents, Math.floor((rental.claimLinesCents * collected) / rental.claimTotalCents))
}

// The rentals the line of findings shows: enough for a season, few enough to read in a cell.
const LINE_LENGTH = 12

export type ItemWear = {
  readonly rentals: number
  readonly damageFindings: number
  // Damage findings rental by rental, oldest first, for the most recent rentals.
  readonly findingsByRental: readonly number[]
  readonly incurredCents: number
  readonly recoveredCents: number
  readonly daysOut: number
}

export function itemWear(rentals: readonly ItemRentalRecord[], window: DateWindow): ItemWear {
  const ordered = [...rentals].sort((first, second) => first.startsAt.getTime() - second.startsAt.getTime())
  return {
    rentals: ordered.length,
    damageFindings: ordered.reduce((total, rental) => total + rental.damageFindings, 0),
    findingsByRental: ordered.slice(-LINE_LENGTH).map((rental) => rental.damageFindings),
    incurredCents: ordered.reduce((total, rental) => total + rental.claimLinesCents, 0),
    recoveredCents: ordered.reduce((total, rental) => total + recoveredCents(rental), 0),
    daysOut: daysOut(ordered, window),
  }
}

export type WearComparison = { readonly itemId: string; readonly typeId: string; readonly rentals: number; readonly damageFindings: number }

// The items wearing fastest: within each type, those with the most damage findings per rental, when that is more than
// nothing and more than another item of the same type shows. An item never rented is not compared.
export function wearingFastest(items: readonly WearComparison[]): ReadonlySet<string> {
  const fastest = new Set<string>()
  const types = new Set(items.map((item) => item.typeId))
  for (const type of types) {
    const rated = items.filter((item) => item.typeId === type && item.rentals > 0).map((item) => ({ id: item.itemId, rate: item.damageFindings / item.rentals }))
    if (rated.length < 2) continue
    const highest = Math.max(...rated.map((item) => item.rate))
    const lowest = Math.min(...rated.map((item) => item.rate))
    if (highest <= 0 || highest === lowest) continue
    for (const item of rated) if (item.rate === highest) fastest.add(item.id)
  }
  return fastest
}

// An item's repairs (architecture.md section 9.6): how many were done and what they cost, and how many are open.
export type ItemRepairs = { readonly done: number; readonly doneCostCents: number; readonly open: number }

// What damage recovered on the item less what its repairs cost. Nothing to say before a repair was done.
export function repairMargin(recoveredCents: number, repairs: ItemRepairs): number | null {
  return repairs.done === 0 ? null : recoveredCents - repairs.doneCostCents
}
