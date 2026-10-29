import type { ClaimState } from './claim.ts'
import { fail, ok } from './result.ts'
import type { Result } from './result.ts'
import { atShopTime, shopTimeText } from './shop-calendar.ts'
import { latestChargeTime } from './upkeep.ts'

// The shop's promise to decide a contested claim (architecture.md section 6.16). Always on: the owner sets how many
// days, and the claim keeps the days it was presented with, so a later change never moves a promise already made.
export const DECISION_PROMISE = { minDays: 1, maxDays: 14, defaultDays: 3 } as const

const DAY = 86_400_000

export function checkPromiseDays(days: number): Result<number, 'promise_days_invalid'> {
  return Number.isInteger(days) && days >= DECISION_PROMISE.minDays && days <= DECISION_PROMISE.maxDays ? ok(days) : fail('promise_days_invalid')
}

// Closing time on the shop's clock, the promised number of days after the contest, or the last minute of that day when
// the shop has not said its hours. Never after the hold's last charge time, so a shop that keeps its promise can still
// collect; a hold already past it cannot be saved by deciding sooner, so it is ignored.
export function decideByFor(input: { readonly contestedAt: Date; readonly days: number; readonly timeZone: string; readonly closes: string | null; readonly validUntil: Date | null }): Date {
  const day = shopTimeText(input.timeZone, new Date(input.contestedAt.getTime() + input.days * DAY)).slice(0, 10)
  const promised = atShopTime(input.timeZone, `${day}T${input.closes ?? '23:59'}`) ?? new Date(input.contestedAt.getTime() + input.days * DAY)
  const last = input.validUntil === null ? null : latestChargeTime(input.validUntil)
  return last !== null && last > input.contestedAt && last < promised ? last : promised
}

export type PromiseFacts = { readonly decideBy: Date | null; readonly decidedAt: Date | null; readonly promiseMissedAt: Date | null }
export type PromiseStanding = 'none' | 'open' | 'kept' | 'missed'

export function promiseStanding(claim: PromiseFacts, now: Date): PromiseStanding {
  if (claim.decideBy === null) return 'none'
  if (claim.promiseMissedAt !== null) return 'missed'
  if (claim.decidedAt !== null) return claim.decidedAt <= claim.decideBy ? 'kept' : 'missed'
  return now < claim.decideBy ? 'open' : 'missed'
}

// The operations agent raises a promise in its last day.
export function promiseDueSoon(claim: PromiseFacts, now: Date): boolean {
  return promiseStanding(claim, now) === 'open' && claim.decideBy !== null && claim.decideBy.getTime() - now.getTime() <= DAY
}

// What Hold does when the date passes undecided. The owner's rule may only waive a claim nothing was taken for yet: a
// claim charged early to protect an expiring hold goes to the owner, whose decision may refund it.
const WAIVABLE: readonly ClaimState[] = ['contested', 'negotiating', 'agreed', 'escalated']
export function missedPromiseOutcome(state: ClaimState, waiveRuleLive: boolean): 'waive' | 'escalate' {
  return waiveRuleLive && WAIVABLE.includes(state) ? 'waive' : 'escalate'
}
