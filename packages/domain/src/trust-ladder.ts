import type { CleanRecord } from './clean-record.ts'
import { add, money, zero } from './money.ts'
import type { Money } from './money.ts'

// A shop's trust ladder (extensions.md section 7.5): so many clean returns earn so much off the hold. Published and
// versioned like a price list, and applied to everyone the same way. Trust only ever lowers a hold: no history, a poor
// history or an unpaid claim means the ordinary hold.

export const TRUST_HISTORIES = ['own', 'network'] as const
// Which history counts: the shop's own only, or its own plus the Hold network, the latter only with the renter's
// consent.
export type TrustHistory = (typeof TRUST_HISTORIES)[number]

export const LADDER_LIMITS = { rungs: 5, cleanReturns: 100, windowMonths: 36, minimumHours: 28 * 24 } as const

export type TrustRung = {
  // Clean returns in the window needed to reach this rung.
  readonly cleanReturns: number
  // The share of the ordinary hold kept, in whole percent.
  readonly sharePercent: number
  // The largest item value this rung lowers the hold for. Undefined covers any value.
  readonly largestValue: Money | undefined
  // A rung with no hold at all needs a saved PayPal method to collect a later claim from. Hold does not keep saved
  // methods yet, so such a rung is never reached.
  readonly needsSavedMethod: boolean
}

export type TrustLadder = {
  readonly currency: string
  readonly history: TrustHistory
  readonly windowMonths: number
  // A rental below these does not build a record (section 7.4).
  readonly minimumFee: Money
  readonly minimumHours: number
  // Rung 1 first. Rung 0, the ordinary hold, is implicit.
  readonly rungs: readonly TrustRung[]
}

export type LadderProblem =
  | { readonly kind: 'too_many_rungs' }
  | { readonly kind: 'window_invalid' }
  | { readonly kind: 'minimum_hours_invalid' }
  | { readonly kind: 'minimum_fee_wrong_currency' }
  | { readonly kind: 'clean_returns_invalid'; readonly rung: number }
  | { readonly kind: 'clean_returns_not_rising'; readonly rung: number }
  | { readonly kind: 'share_invalid'; readonly rung: number }
  | { readonly kind: 'share_not_falling'; readonly rung: number }
  | { readonly kind: 'share_zero_needs_saved_method'; readonly rung: number }
  | { readonly kind: 'cover_invalid'; readonly rung: number }

const isWhole = (value: number, low: number, high: number) => Number.isInteger(value) && value >= low && value <= high

// Each rung needs more clean returns than the one before and keeps less of the hold. Without a saved method the lowest
// share is above zero (section 7.5).
export function checkLadder(ladder: TrustLadder): readonly LadderProblem[] {
  const problems: LadderProblem[] = []
  if (ladder.rungs.length > LADDER_LIMITS.rungs) problems.push({ kind: 'too_many_rungs' })
  if (!isWhole(ladder.windowMonths, 1, LADDER_LIMITS.windowMonths)) problems.push({ kind: 'window_invalid' })
  if (!isWhole(ladder.minimumHours, 0, LADDER_LIMITS.minimumHours)) problems.push({ kind: 'minimum_hours_invalid' })
  if (ladder.minimumFee.currency !== ladder.currency) problems.push({ kind: 'minimum_fee_wrong_currency' })
  ladder.rungs.forEach((current, index) => {
    const rung = index + 1
    const previous = ladder.rungs[index - 1]
    if (!isWhole(current.cleanReturns, 1, LADDER_LIMITS.cleanReturns)) problems.push({ kind: 'clean_returns_invalid', rung })
    else if (previous !== undefined && current.cleanReturns <= previous.cleanReturns) problems.push({ kind: 'clean_returns_not_rising', rung })
    if (!isWhole(current.sharePercent, 0, 99)) problems.push({ kind: 'share_invalid', rung })
    else if (previous !== undefined && current.sharePercent >= previous.sharePercent) problems.push({ kind: 'share_not_falling', rung })
    else if (current.sharePercent === 0 && !current.needsSavedMethod) problems.push({ kind: 'share_zero_needs_saved_method', rung })
    if (current.largestValue !== undefined && (current.largestValue.currency !== ladder.currency || current.largestValue.cents === 0)) problems.push({ kind: 'cover_invalid', rung })
  })
  return problems
}

export type ItemHold = { readonly hold: Money; readonly value: Money }

export type LadderHold = { readonly amount: Money; readonly ordinary: Money; readonly rung: number }

// The share of the hold, rounded up to the cent, so it is never below its share and never above the hold.
function share(hold: Money, percent: number): Money {
  const kept = Math.ceil((hold.cents * Math.min(100, Math.max(0, percent))) / 100)
  return money(Math.min(kept, hold.cents), hold.currency)
}

// The hold for one item. Of the rungs the record reaches whose value cover the item fits, the one keeping the least
// applies, so the value cover stops a record built on helmets from lowering an e-bike's hold. A record with an unpaid
// claim reaches none. Reaching more rungs can only add choices, so the hold never rises as clean returns rise.
export function holdFor(item: ItemHold, ladder: TrustLadder, record: CleanRecord): LadderHold {
  let best: LadderHold = { amount: item.hold, ordinary: item.hold, rung: 0 }
  if (record.unpaid > 0) return best
  ladder.rungs.forEach((rung, index) => {
    const reached = !rung.needsSavedMethod && record.clean >= rung.cleanReturns
    const covered = rung.largestValue === undefined || item.value.cents <= rung.largestValue.cents
    if (!reached || !covered) return
    const amount = share(item.hold, rung.sharePercent)
    if (amount.cents < best.amount.cents) best = { amount, ordinary: item.hold, rung: index + 1 }
  })
  return best
}

export type RentalLadderHold = LadderHold & {
  // What the renter's page says: the hold is this, not the ordinary one, because of these returns in this window.
  readonly cleanReturns: number
  readonly windowMonths: number
}

// The hold for a whole rental: each item's, added up. Its rung is the highest applied to any item. With no ladder
// published, every hold is ordinary.
export function rentalHoldFor(items: readonly ItemHold[], ladder: TrustLadder | undefined, record: CleanRecord): RentalLadderHold {
  const currency = items[0]?.hold.currency ?? ladder?.currency ?? 'XXX'
  let total = { amount: zero(currency), ordinary: zero(currency), rung: 0 }
  for (const item of items) {
    const each = ladder === undefined ? { amount: item.hold, ordinary: item.hold, rung: 0 } : holdFor(item, ladder, record)
    total = { amount: add(total.amount, each.amount), ordinary: add(total.ordinary, each.ordinary), rung: Math.max(total.rung, each.rung) }
  }
  return { ...total, cleanReturns: record.clean, windowMonths: ladder?.windowMonths ?? record.windowMonths }
}
