import { z } from 'zod'

// What each queue carries (architecture.md section 14.7). The worker reads every message with its queue's schema, so
// a message written here and one read there cannot disagree.

export const executionMessageSchema = z.object({ shopId: z.uuid(), executionId: z.uuid() })
export const paypalEventMessageSchema = z.object({ shopId: z.uuid(), eventId: z.uuid() })
export const upkeepMessageSchema = z.union([z.strictObject({ shopId: z.uuid(), holdId: z.uuid(), authorizationId: z.uuid(), kind: z.enum(['replace', 'expire']) }), z.strictObject({ shopId: z.uuid(), claimId: z.uuid(), kind: z.enum(['claim_plan', 'claim_due', 'claim_promise']) })])

export type UpkeepMessage = z.infer<typeof upkeepMessageSchema>
