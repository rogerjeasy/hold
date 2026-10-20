import { z } from 'zod'
export const claimLineInput = z.strictObject({ priceEntryId: z.uuid(), findingId: z.uuid().optional(), reason: z.string().trim().min(1).max(1000).optional() })
export const claimLinesInput = z.string().max(100000).transform((text, context) => {
  try { return JSON.parse(text) as unknown } catch { context.addIssue({ code: 'custom', message: 'Invalid lines' }); return z.NEVER }
}).pipe(z.array(claimLineInput).min(1).max(50))
export const claimReason = z.string().trim().min(1).max(1000)
