import { isExpoPushToken, isStaffPushPath, PUSH_PLATFORMS, RENTER_PUSH_PAGES } from '@hold/domain'
import { z } from 'zod'

// Push notifications to the phone (architecture.md section 13.9): what a phone registers with, and what a push it is
// sent carries. A push names no link token: a renter's push carries the random reference this phone was given when it
// registered, which only this phone can match to its saved link.

export const pushTokenSchema = z.string().max(250).refine(isExpoPushToken)
export const pushRegistration = { pushToken: pushTokenSchema, platform: z.enum(PUSH_PLATFORMS) }

const renterPages = [...new Set(Object.values(RENTER_PUSH_PAGES))] as [string, ...string[]]

// A push is read as untrusted: anyone holding a phone's push token can send it one. Only a page of a saved rental, or a
// counter screen of this shape, is ever opened.
export const pushDataSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('renter'), reference: z.string().min(1).max(64), page: z.enum(renterPages) }),
  z.object({ kind: z.literal('staff'), shopId: z.uuid(), path: z.string().refine(isStaffPushPath) }),
])
export type PushData = z.infer<typeof pushDataSchema>
