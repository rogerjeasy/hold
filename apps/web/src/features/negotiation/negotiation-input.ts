import { SETTLEMENT_LIMITS } from '@hold/domain'
import { z } from 'zod'

// What the advocate and settlement forms send, checked the same way in the browser and on the server. An amount is
// written in whole units with at most two decimals; it becomes cents with the currency's rules where it is used.

export const amountText = z.string().trim().regex(/^\d{1,7}(?:[.,]\d{1,2})?$/)

export const settlementLimitsInput = {
  lowestShare: z.coerce.number().int().min(0).max(100),
  largestClaim: amountText,
  rounds: z.coerce.number().int().min(SETTLEMENT_LIMITS.minRounds).max(SETTLEMENT_LIMITS.maxRounds),
  evidenceRequired: z.enum(['yes', 'no']),
  days: z.coerce.number().int().min(1).max(366),
}

export const advocateInput = {
  code: z.string().regex(/^[0-9]{8}$/),
  highest: amountText,
  comment: z.string().trim().max(1000).optional(),
  // Who argues it: Hold's advocate, or the renter's own assistant connected to this rental (extensions.md 9.11).
  advocate: z.enum(['hold', 'assistant']).optional(),
}
