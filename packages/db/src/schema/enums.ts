import { CAPTURE_SESSION_KINDS, CLAIM_STATES, CONDITION_REPLIES, DETECTOR_KINDS, FINDING_VERDICTS, HOLD_STATES, INCIDENT_HINTS, INCIDENT_KINDS, INCIDENT_STATES, ITEM_CATEGORIES, ITEM_STATUSES, MANDATE_KINDS, PRICE_CATEGORIES, PROPOSAL_KINDS, PROPOSAL_STATES, REMINDER_KINDS, RENTAL_STATES, STAFF_ROLES, STORED_OUTCOMES, TRUST_HISTORIES } from '@hold/domain'
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
// reported: first seen in a renter's incident report during the rental it belongs to (extensions.md section 10.6).
export const MARK_STATUSES = ['open', 'repaired', 'reported'] as const
export const COMPARISON_STATES = ['pending', 'running', 'clean', 'findings', 'deferred', 'failed'] as const
// reported: matches a mark the renter reported during this rental that a line already speaks for, or none may.
export const FINDING_CLASSES = ['new_damage', 'known_mark', 'wear', 'missing_part', 'uncertain', 'reported'] as const
export const CLAIM_LINE_SOURCES = ['finding', 'person', 'agreed_in_rental'] as const
export const CLAIM_REPLY_DECISIONS = ['accept', 'contest'] as const
export const APPROVAL_SUBJECTS = ['claim', 'release', 'refund', 'proposal'] as const
export const APPROVAL_DECISIONS = ['approved', 'rejected', 'waived'] as const
export const APPROVAL_METHODS = ['on_screen', 'mandate'] as const
// authorize places a hold the renter approved; fee_capture takes the rental fee, before any hold.
export const EXECUTION_ACTIONS = ['authorize', 'renew', 'release', 'capture', 'refund', 'invoice', 'fee_capture'] as const
// Who made a booking: staff at the counter or on the phone, or the renter on the shop's page.
// Who made a booking: staff, a renter on the shop's own page, or a renter's own assistant (extensions.md section 8).
export const BOOKING_CHANNELS = ['staff', 'shop_page', 'assistant'] as const
export type BookingChannel = (typeof BOOKING_CHANNELS)[number]
export const EXECUTION_STATES = ['pending', 'submitted', 'confirmed', 'failed'] as const
export const VERIFICATION_STATES = ['pending', 'verified', 'rejected', 'simulated'] as const
export const PROCESSING_STATES = ['pending', 'applied', 'ignored', 'failed'] as const
export const MONEY_EVENT_KINDS = ['fee_captured', 'hold_placed', 'hold_renewed', 'hold_released', 'hold_captured', 'refunded', 'invoice_sent', 'invoice_paid'] as const
export const INVOICE_STATES = ['draft', 'sent', 'paid', 'cancelled'] as const
export const OUTBOX_STATES = ['pending', 'sent'] as const
// What came of asking the model to sort an incident. Anything but answered leaves the sorting to code and a person.
export const TRIAGE_OUTCOMES = ['answered', 'refused', 'unavailable', 'invalid'] as const
// What a renter consents to: their record of clean returns used to lower holds at other Hold shops.
export const CONSENT_PURPOSES = ['network_history'] as const

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

// Which half of the evaluation set a run measured: the tuning half, or the gate half that is never tuned on.
export const EVALUATION_HALVES = ['tuning', 'gate'] as const
export const evaluationHalf = oneOf(EVALUATION_HALVES)
export const findingVerdict = oneOf(FINDING_VERDICTS)

// The operations agent and the mandates behind it (extensions.md sections 4 and 6).
export const OPS_RUN_STATES = ['running', 'completed', 'failed'] as const
export const OPS_TRIGGERS = ['nightly', 'dispute_opened', 'hold_at_risk', 'capture_failed', 'manual'] as const
export const RULE_STATES = ['drafted', 'confirmed', 'discarded'] as const
// A staff member's own screen, or a renter's one-time code.
export const GRANT_METHODS = ['on_screen', 'one_time_code'] as const
export const opsRunState = oneOf(OPS_RUN_STATES)
export const opsTrigger = oneOf(OPS_TRIGGERS)
export const ruleState = oneOf(RULE_STATES)
export const grantMethod = oneOf(GRANT_METHODS)
export const mandateKind = oneOf(MANDATE_KINDS)
export const proposalKind = oneOf(PROPOSAL_KINDS)
export const proposalState = oneOf(PROPOSAL_STATES)
export const detectorKind = oneOf(DETECTOR_KINDS)
export const reminderKind = oneOf(REMINDER_KINDS)
export { INCIDENT_HINTS, INCIDENT_KINDS, INCIDENT_STATES }
export const incidentHint = oneOf(INCIDENT_HINTS)
export const incidentKind = oneOf(INCIDENT_KINDS)
export const incidentState = oneOf(INCIDENT_STATES)
export const triageOutcome = oneOf(TRIAGE_OUTCOMES)
export const trustHistory = oneOf(TRUST_HISTORIES)
export const storedOutcome = oneOf(STORED_OUTCOMES)
export const consentPurpose = oneOf(CONSENT_PURPOSES)
