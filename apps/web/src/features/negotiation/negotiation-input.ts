import { SETTLEMENT_LIMITS } from '@hold/domain'
import { amountText } from '@hold/mobile-api'
import { z } from 'zod'

// What the settlement forms send, checked the same way in the browser and on the server. An amount is
// written in whole units with at most two decimals; it becomes cents with the currency's rules where it is used.

// Written once, in the phone's contract, which the renter's advocate form shares.
export { amountText }

export const settlementLimitsInput = {
  lowestShare: z.coerce.number().int().min(0).max(100),
  largestClaim: amountText,
  rounds: z.coerce.number().int().min(SETTLEMENT_LIMITS.minRounds).max(SETTLEMENT_LIMITS.maxRounds),
  evidenceRequired: z.enum(['yes', 'no']),
  days: z.coerce.number().int().min(1).max(366),
}
