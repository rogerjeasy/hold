import { z } from 'zod'

// Every /api/mobile/v1 answer has one of these shapes, so the phone app reads a refusal the same way everywhere.
// The failure codes are the ones the web app's server functions already return (renter-access.ts, shop-access.ts).
export const FAILURES = ['link_invalid', 'scope', 'rate_limited', 'invalid', 'refused', 'signed_out', 'no_shop', 'role', 'passkey_needed', 'not_found'] as const
export const failureSchema = z.enum(FAILURES)
export type Failure = z.infer<typeof failureSchema>

export const failedSchema = z
  .object({ ok: z.literal(false), failure: failureSchema, fields: z.array(z.string()).optional(), reason: z.string().optional() })
  .strict()
export type Failed = z.infer<typeof failedSchema>

export const answerSchema = <Value extends z.ZodType>(value: Value) => z.union([z.object({ ok: z.literal(true), value }).strict(), failedSchema])
