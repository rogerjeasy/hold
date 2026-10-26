import { z } from 'zod'
// A line from the price list, or the line the renter agreed during the rental at the amount staff keep. The amount is a
// person's reduction, checked on the server against the agreed amount, never above it.
export const claimLineInput = z.union([
  z.strictObject({ priceEntryId: z.uuid(), findingId: z.uuid().optional(), reason: z.string().trim().min(1).max(1000).optional() }),
  z.strictObject({ incidentId: z.uuid(), amountCents: z.number().int().min(1).max(100_000_000) }),
])
export const claimLinesInput = z.string().max(100000).transform((text, context) => {
  try { return JSON.parse(text) as unknown } catch { context.addIssue({ code: 'custom', message: 'Invalid lines' }); return z.NEVER }
}).pipe(z.array(claimLineInput).min(1).max(50))
export const claimReason = z.string().trim().min(1).max(1000)
