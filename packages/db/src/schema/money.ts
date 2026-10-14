import { integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core'
import { shopIsolation } from './access.ts'
import { claims } from './claims.ts'
import { at, cents, createdAt, currency, id, reference } from './columns.ts'
import { allowed, EXECUTION_ACTIONS, EXECUTION_STATES, executionAction, executionState, INVOICE_STATES, invoiceState, MONEY_EVENT_KINDS, moneyEventKind, PROCESSING_STATES, processingState, VERIFICATION_STATES, verificationState } from './enums.ts'
import { holds, rentals } from './rentals.ts'
import { paypalAccounts, shopReference } from './shops.ts'

// One attempt to carry out an approved action through PayPal (architecture.md section 7.6).
export const executions = pgTable(
  'executions',
  {
    id: id(),
    shopId: shopReference(),
    holdId: reference()
      .notNull()
      .references(() => holds.id),
    action: executionAction().notNull(),
    // Sent to PayPal as PayPal-Request-Id, so a retry cannot act twice.
    idempotencyKey: text().notNull().unique(),
    currency: currency(),
    amountCents: cents(),
    paypalResourceIds: jsonb().$type<Readonly<Record<string, string>>>().notNull().default({}),
    state: executionState().notNull().default('pending'),
    attempts: integer().notNull().default(0),
    lastError: text(),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (table) => [allowed(table.action, EXECUTION_ACTIONS), allowed(table.state, EXECUTION_STATES), shopIsolation(table.shopId)],
)

// Stored before anything else, so no event is lost and the signature is checked against the exact bytes received.
export const paypalEvents = pgTable(
  'paypal_events',
  {
    id: id(),
    shopId: shopReference(),
    paypalAccountId: reference()
      .notNull()
      .references(() => paypalAccounts.id),
    paypalEventId: text().notNull().unique(),
    type: text().notNull(),
    rawBody: text().notNull(),
    headers: jsonb().$type<Readonly<Record<string, string>>>().notNull(),
    verification: verificationState().notNull().default('pending'),
    processing: processingState().notNull().default('pending'),
    rentalId: reference().references(() => rentals.id),
    receivedAt: createdAt(),
  },
  (table) => [allowed(table.verification, VERIFICATION_STATES), allowed(table.processing, PROCESSING_STATES), shopIsolation(table.shopId)],
)

// The money log. Append-only, one row per PayPal reference, so applying an event twice writes nothing new.
export const moneyEvents = pgTable(
  'money_events',
  {
    id: id(),
    shopId: shopReference(),
    rentalId: reference()
      .notNull()
      .references(() => rentals.id),
    holdId: reference().references(() => holds.id),
    kind: moneyEventKind().notNull(),
    currency: currency().notNull(),
    // What moved. For a capture, PayPal's fee and the shop's net are recorded beside it.
    amountCents: cents().notNull(),
    paypalFeeCents: cents(),
    netCents: cents(),
    paypalReference: text().notNull().unique(),
    occurredAt: at().notNull(),
    recordedAt: createdAt(),
  },
  (table) => [allowed(table.kind, MONEY_EVENT_KINDS), shopIsolation(table.shopId)],
)

export const invoices = pgTable(
  'invoices',
  {
    id: id(),
    shopId: shopReference(),
    rentalId: reference()
      .notNull()
      .references(() => rentals.id),
    claimId: reference()
      .notNull()
      .references(() => claims.id),
    paypalInvoiceId: text().unique(),
    currency: currency().notNull(),
    amountCents: cents().notNull(),
    state: invoiceState().notNull().default('draft'),
    createdAt: createdAt(),
  },
  (table) => [allowed(table.state, INVOICE_STATES), shopIsolation(table.shopId)],
)
