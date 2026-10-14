import { z } from 'zod'

// One sign-in, sign-up or invitation between its steps: the address the code went to, the identity service's handle
// on the attempt, and what to do once the person is proven: create a shop, or accept an invitation.
// Carried in a sealed cookie.

// As long as the identity service keeps the attempt open (infra/lib/identity-stack.ts).
export const ATTEMPT_MINUTES = 10

const attemptSchema = z
  .object({
    page: z.enum(['signIn', 'signUp', 'invite', 'confirm']),
    // Which proof the person was asked for: a code confirming a new address, a sign-in code, or a passkey.
    step: z.enum(['confirm_sign_up', 'answer_sign_in', 'answer_passkey']),
    email: z.string(),
    session: z.string().optional(),
    newShop: z.object({ ownerName: z.string(), shopName: z.string(), timeZone: z.string() }).strict().optional(),
    invitation: z.object({ token: z.string(), name: z.string() }).strict().optional(),
    // A shop page to return to, once a passkey has confirmed the person.
    returnTo: z.string().startsWith('/shop').optional(),
    language: z.string(),
    expiresAt: z.number(),
  })
  .strict()

export type Attempt = z.infer<typeof attemptSchema>
export type AttemptPage = Attempt['page']

export function readAttempt(value: unknown, now: Date): Attempt | undefined {
  const parsed = attemptSchema.safeParse(value)
  return parsed.success && parsed.data.expiresAt > now.getTime() ? parsed.data : undefined
}

export function attemptExpiry(now: Date): number {
  return now.getTime() + ATTEMPT_MINUTES * 60 * 1000
}
