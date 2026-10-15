import { addDays, HOLD_VALIDITY_DAYS } from './hold-clocks.ts'
import { REPLACEMENT_LEAD_DAYS } from './upkeep.ts'
import type { AuthorizationClocks } from './upkeep.ts'

// Where a placed hold stands, for the people deciding about it: inside the period in which a capture is best
// assured, past it but still valid, or close enough to its end that someone must release it or claim against it.
export type HoldStanding = 'assured' | 'valid' | 'ending'

type Clocks = Pick<AuthorizationClocks, 'assuredUntil' | 'validUntil'> & { readonly createdAt: Date }

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

// A hold is ending from the moment upkeep would start a replacement for a rental still open.
export function holdStanding(clocks: Clocks, now: Date): HoldStanding {
  if (now >= addDays(clocks.validUntil, -REPLACEMENT_LEAD_DAYS)) return 'ending'
  return now < clocks.assuredUntil ? 'assured' : 'valid'
}

// The day of the hold's life, counted from one, as in "day 26 of 29".
export function holdDay(clocks: Clocks, now: Date): number {
  const elapsed = Math.floor((now.getTime() - clocks.createdAt.getTime()) / MILLISECONDS_PER_DAY) + 1
  return Math.min(Math.max(elapsed, 1), HOLD_VALIDITY_DAYS)
}
