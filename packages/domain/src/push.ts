import type { StaffRole } from './approval.ts'
import type { TextPurpose } from './renter-contact.ts'

// Push notifications to Hold's phone app (architecture.md section 13.9). A push travels through Expo, Apple and Google,
// so it says only that something happened and which screen shows it: never a link token, a code, an amount, an email
// or a phone number. It comes beside a renter's chosen text or email, never instead of it.

export const PUSH_PLATFORMS = ['ios', 'android'] as const
export type PushPlatform = (typeof PUSH_PLATFORMS)[number]

// Expo hands out ExponentPushToken[…] (and ExpoPushToken[…] in newer builds); a raw APNs or FCM token is not taken.
const EXPO_PUSH_TOKEN = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$/
export const isExpoPushToken = (value: string): boolean => EXPO_PUSH_TOKEN.test(value)

// Each thing a renter's phone is told, and the page of their rental it opens ('rental' is the rental's own page).
export const RENTER_PUSH_PAGES = {
  condition_ready: 'condition',
  return_checked: 'return',
  shop_message: 'claim',
  due_back: 'rental',
  hold_needed: 'rental',
  promise_missed: 'claim',
  receipt: 'record',
  claim_ready: 'claim',
  claim_decided: 'claim',
} as const
export type RenterPushEvent = keyof typeof RENTER_PUSH_PAGES
export type RenterPushPage = (typeof RENTER_PUSH_PAGES)[RenterPushEvent]
export const RENTER_PUSH_EVENTS = Object.keys(RENTER_PUSH_PAGES) as RenterPushEvent[]

// The push that goes with each message to a renter. A one-time code and the link itself are never pushed: they go only
// where the renter chose, by text or by email.
export const PUSH_FOR_TEXT: Readonly<Partial<Record<TextPurpose, RenterPushEvent>>> = {
  condition_link: 'condition_ready',
  drop_off: 'return_checked',
  shop_message: 'shop_message',
  reminder: 'due_back',
  hold_renewal: 'hold_needed',
  promise_missed: 'promise_missed',
  receipt: 'receipt',
}

// Each thing a member of staff's phone is told, and the roles that hear it. Read-only members are told nothing.
export const STAFF_PUSH_ROLES = {
  drop_off_waiting: ['owner', 'manager', 'counter_staff'],
  renter_message: ['owner', 'manager', 'counter_staff'],
  comparison_ready: ['owner', 'manager', 'counter_staff'],
  decision_waiting: ['owner', 'manager'],
} as const satisfies Record<string, readonly StaffRole[]>
export type StaffPushEvent = keyof typeof STAFF_PUSH_ROLES
export const STAFF_PUSH_EVENTS = Object.keys(STAFF_PUSH_ROLES) as StaffPushEvent[]

// The counter screen a staff push opens. The phone opens only a path of this shape: anyone holding a phone's push token
// can send it a notification, so a path is never trusted for being in one.
export type StaffPushTarget = { readonly to: 'rental' | 'review'; readonly id: string } | { readonly to: 'drop_offs' }
export const staffPushPath = (target: StaffPushTarget): string => (target.to === 'drop_offs' ? '/shop/drop-offs' : `/shop/${target.to}/${target.id}`)
const STAFF_PUSH_PATH = /^\/shop\/(?:(?:rental|review)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|drop-offs)$/
export const isStaffPushPath = (path: string): boolean => STAFF_PUSH_PATH.test(path)
