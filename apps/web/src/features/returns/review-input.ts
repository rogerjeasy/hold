import { z } from 'zod'

export const reviewNote = z.strictObject({ outcome: z.enum(['clean', 'findings', 'deferred']), reason: z.string().trim().min(1).max(1000) })
