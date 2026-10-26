import { DETECTOR_KINDS, MANDATE_KINDS, PROPOSAL_KINDS, PROPOSAL_STATES, REMINDER_KINDS } from '@hold/domain'
import type { OwnerRule } from '@hold/domain'
import { boolean, date, integer, jsonb, pgTable, text, unique } from 'drizzle-orm/pg-core'
import { shopIsolation } from './access.ts'
import { at, cents, createdAt, id, reference } from './columns.ts'
import { allowed, detectorKind, GRANT_METHODS, grantMethod, mandateKind, OPS_RUN_STATES, OPS_TRIGGERS, opsRunState, opsTrigger, proposalKind, proposalState, reminderKind, RULE_STATES, ruleState } from './enums.ts'
import { rentals, renters } from './rentals.ts'
import { shopReference, users } from './shops.ts'

// A person's written permission for an agent to act within limits (extensions.md section 4.2). It is an approval
// given in advance: limits are typed by kind, never free text, and only the end date and revocation ever change.
export const mandates = pgTable(
  'mandates',
  {
    id: id(),
    shopId: shopReference(),
    kind: mandateKind().notNull(),
    // A staff member, or a renter identified by a one-time code.
    grantedByUserId: reference().references(() => users.id),
    grantedByRenterId: reference().references(() => renters.id),
    rentalId: reference().references(() => rentals.id),
    // Which agent may act: the operations agent, the shop's advocate, or a renter's assistant or advocate.
    agent: text().notNull(),
    limits: jsonb().$type<Readonly<Record<string, unknown>>>().notNull(),
    validFrom: at().notNull(),
    validUntil: at().notNull(),
    revokedAt: at(),
    grantedHow: grantMethod().notNull(),
    createdAt: createdAt(),
  },
  (table) => [allowed(table.kind, MANDATE_KINDS), allowed(table.grantedHow, GRANT_METHODS), shopIsolation(table.shopId)],
)

// One run of the operations agent over one shop (section 6). It records what the run used and found.
export const opsRuns = pgTable(
  'ops_runs',
  {
    id: id(),
    shopId: shopReference(),
    trigger: opsTrigger().notNull(),
    state: opsRunState().notNull().default('running'),
    startedAt: at().notNull(),
    completedAt: at(),
    toolCalls: integer().notNull().default(0),
    inputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),
    // Null when the model was not reached: the queue was then built from the detectors alone.
    model: text(),
    promptVersion: text(),
    // Whether PayPal could be checked, through its MCP server or directly.
    paypalChecked: boolean().notNull().default(false),
    counts: jsonb().$type<Readonly<Record<string, number>>>().notNull().default({}),
  },
  (table) => [allowed(table.state, OPS_RUN_STATES), allowed(table.trigger, OPS_TRIGGERS), shopIsolation(table.shopId)],
)

// What a detector found. The fingerprint names the detector, its subject and the state it saw, so a repeated run
// finds the same row and writes nothing new.
export const shopExceptions = pgTable(
  'exceptions',
  {
    id: id(),
    shopId: shopReference(),
    kind: detectorKind().notNull(),
    subjectKind: text().notNull(),
    subjectId: text().notNull(),
    rentalId: reference().references(() => rentals.id),
    fingerprint: text().notNull(),
    deadline: at(),
    moneyCents: cents().notNull().default(0),
    detectedAt: at().notNull(),
    resolvedAt: at(),
    lastRunId: reference().references(() => opsRuns.id),
  },
  (table) => [allowed(table.kind, DETECTOR_KINDS), unique().on(table.shopId, table.fingerprint), shopIsolation(table.shopId)],
)

// What an agent asks a person to approve (section 4.3). It names records, not amounts: the amount shown and the
// amount sent to PayPal are read from the database at that moment. One live proposal per subject, kind and state.
export const proposals = pgTable(
  'proposals',
  {
    id: id(),
    shopId: shopReference(),
    kind: proposalKind().notNull(),
    subjectKind: text().notNull(),
    subjectId: text().notNull(),
    rentalId: reference().references(() => rentals.id),
    exceptionId: reference().references(() => shopExceptions.id),
    payload: jsonb().$type<Readonly<Record<string, string>>>().notNull().default({}),
    // One line, in plain words, and the PayPal references that prove it.
    reason: text().notNull(),
    references: jsonb().$type<readonly string[]>().notNull().default([]),
    // A drafted message or dispute note, for a person to send or discard.
    draft: text(),
    preconditionFingerprint: text().notNull(),
    state: proposalState().notNull().default('pending'),
    // An observation the agent raised that no detector looks for. It can only ever be a note.
    raisedByAgent: boolean().notNull().default(false),
    runId: reference().references(() => opsRuns.id),
    model: text(),
    promptVersion: text(),
    decidedByUserId: reference().references(() => users.id),
    mandateId: reference().references(() => mandates.id),
    decisionReason: text(),
    decidedAt: at(),
    postponedUntil: at(),
    executionId: reference(),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (table) => [allowed(table.kind, PROPOSAL_KINDS), allowed(table.state, PROPOSAL_STATES), unique().on(table.shopId, table.kind, table.subjectId, table.preconditionFingerprint), shopIsolation(table.shopId)],
)

// A rule drafted from a rejection, which only the owner can make active (section 6.5).
export const opsRules = pgTable(
  'ops_rules',
  {
    id: id(),
    shopId: shopReference(),
    rule: jsonb().$type<OwnerRule>().notNull(),
    state: ruleState().notNull().default('drafted'),
    fromProposalId: reference().references(() => proposals.id),
    decidedByUserId: reference().references(() => users.id),
    createdAt: createdAt(),
    decidedAt: at(),
  },
  (table) => [allowed(table.state, RULE_STATES), shopIsolation(table.shopId)],
)

// Each automatic reminder sent: at most one of each kind to a renter a day.
export const reminders = pgTable(
  'reminders',
  {
    id: id(),
    shopId: shopReference(),
    kind: reminderKind().notNull(),
    renterId: reference().references(() => renters.id),
    rentalId: reference().references(() => rentals.id),
    sentOn: date({ mode: 'string' }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [allowed(table.kind, REMINDER_KINDS), unique().on(table.shopId, table.kind, table.renterId, table.sentOn), shopIsolation(table.shopId)],
)
