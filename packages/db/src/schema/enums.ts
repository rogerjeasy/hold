import { CAPTURE_SESSION_KINDS, CLAIM_STATES, CONDITION_REPLIES, HOLD_STATES, ITEM_CATEGORIES, ITEM_STATUSES, PRICE_CATEGORIES, RENTAL_STATES, STAFF_ROLES } from '@hold/domain'
import { sql } from 'drizzle-orm'
import { check, text } from 'drizzle-orm/pg-core'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

// Columns that hold one of a fixed list of values. They are text with a check constraint, not PostgreSQL enums:
// the RDS Data API sends every string parameter as text, and PostgreSQL will not compare an enum with text, so
// every query on an enum column would need a cast. The state machines' states come from the domain, so the
// database and the code can never disagree on them.

type Values = readonly [string, ...string[]]

function oneOf<const Allowed extends Values>(values: Allowed) {
  return () => text({ enum: [...values] as [Allowed[number], ...Allowed[number][]] })
}

const VALUE_SHAPE = /^[a-z_]+$/

// The check constraint for a column built by oneOf, so the database refuses a value the code does not know.
// Every such column needs one. row-level-security.test.ts fails on a column without it.
export function allowed(column: AnyPgColumn, values: Values) {
  if (!values.every((value) => VALUE_SHAPE.test(value))) throw new Error(`${column.name} has a value that is not a plain word.`)
  return check(`${column.name}_allowed`, sql`${column} in (${sql.raw(values.map((value) => `'${value}'`).join(', '))})`)
}

export const PAYPAL_MODES = ['sandbox', 'live'] as const
export const PLACEMENT_STRATEGIES = ['at_counter', 'combined', 'saved_method'] as const
export const AUTHORIZATION_STATES = ['created', 'renewed', 'voided', 'captured', 'expired'] as const
export const MARK_STATUSES = ['open', 'repaired'] as const
export const COMPARISON_STATES = ['pending', 'running', 'clean', 'findings', 'deferred', 'failed'] as const
export const FINDING_CLASSES = ['new_damage', 'known_mark', 'wear', 'missing_part', 'uncertain'] as const
export const CLAIM_LINE_SOURCES = ['finding', 'person'] as const
export const CLAIM_REPLY_DECISIONS = ['accept', 'contest'] as const
export const APPROVAL_SUBJECTS = ['claim', 'release', 'refund'] as const
export const APPROVAL_DECISIONS = ['approved', 'rejected', 'waived'] as const
export const APPROVAL_METHODS = ['on_screen', 'mandate'] as const
// authorize places a hold the renter approved; fee_capture takes the rental fee, before any hold.
export const EXECUTION_ACTIONS = ['authorize', 'renew', 'release', 'capture', 'refund', 'invoice', 'fee_capture'] as const
// Who made a booking: staff at the counter or on the phone, or the renter on the shop's page.
export const BOOKING_CHANNELS = ['staff', 'shop_page'] as const
export const EXECUTION_STATES = ['pending', 'submitted', 'confirmed', 'failed'] as const
export const VERIFICATION_STATES = ['pending', 'verified', 'rejected', 'simulated'] as const
export const PROCESSING_STATES = ['pending', 'applied', 'ignored', 'failed'] as const
export const MONEY_EVENT_KINDS = ['fee_captured', 'hold_placed', 'hold_renewed', 'hold_released', 'hold_captured', 'refunded', 'invoice_sent', 'invoice_paid'] as const
export const INVOICE_STATES = ['draft', 'sent', 'paid', 'cancelled'] as const
export const OUTBOX_STATES = ['pending', 'sent'] as const

export const rentalState = oneOf(RENTAL_STATES)
export const holdState = oneOf(HOLD_STATES)
export const claimState = oneOf(CLAIM_STATES)
export const staffRole = oneOf(STAFF_ROLES)
export const priceCategory = oneOf(PRICE_CATEGORIES)
export const itemCategory = oneOf(ITEM_CATEGORIES)
export const itemStatus = oneOf(ITEM_STATUSES)
export const paypalMode = oneOf(PAYPAL_MODES)
export const placementStrategy = oneOf(PLACEMENT_STRATEGIES)
export const authorizationState = oneOf(AUTHORIZATION_STATES)
export { CAPTURE_SESSION_KINDS, CONDITION_REPLIES }
export const captureSessionKind = oneOf(CAPTURE_SESSION_KINDS)
export const conditionReply = oneOf(CONDITION_REPLIES)
export const markStatus = oneOf(MARK_STATUSES)
export const comparisonState = oneOf(COMPARISON_STATES)
export const findingClass = oneOf(FINDING_CLASSES)
export const claimLineSource = oneOf(CLAIM_LINE_SOURCES)
export const claimReplyDecision = oneOf(CLAIM_REPLY_DECISIONS)
export const approvalSubject = oneOf(APPROVAL_SUBJECTS)
export const approvalDecision = oneOf(APPROVAL_DECISIONS)
export const approvalMethod = oneOf(APPROVAL_METHODS)
export const executionAction = oneOf(EXECUTION_ACTIONS)
export const executionState = oneOf(EXECUTION_STATES)
export const verificationState = oneOf(VERIFICATION_STATES)
export const processingState = oneOf(PROCESSING_STATES)
export const moneyEventKind = oneOf(MONEY_EVENT_KINDS)
export const invoiceState = oneOf(INVOICE_STATES)
export const outboxState = oneOf(OUTBOX_STATES)
export const bookingChannel = oneOf(BOOKING_CHANNELS)
