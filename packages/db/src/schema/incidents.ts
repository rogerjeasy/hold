import type { IncidentTriage } from '@hold/domain'
import { boolean, jsonb, pgTable, text } from 'drizzle-orm/pg-core'
import { shopIsolation } from './access.ts'
import { priceEntries } from './catalog.ts'
import { at, cents, createdAt, currency, id, reference } from './columns.ts'
import { allowed, INCIDENT_HINTS, INCIDENT_KINDS, INCIDENT_STATES, incidentHint, incidentKind, incidentState, TRIAGE_OUTCOMES, triageOutcome } from './enums.ts'
import { captureSessions } from './evidence.ts'
import { rentalItems, rentals } from './rentals.ts'
import { shopReference, users } from './shops.ts'

// What a theft or loss report adds, in the renter's own words: quoted data, never instructions.
export type TheftDetails = { readonly where: string; readonly when: string; readonly lockAndKeys: string; readonly policeReport: string }

// Something a renter reported during a rental (extensions.md section 10). The renter's words, the kind code and the
// model sorted it into, and any line they agreed to. Nothing here is ever charged by itself: an agreed line reaches the
// claim at the return, where a person confirms it.
export const incidents = pgTable(
  'incidents',
  {
    id: id(),
    shopId: shopReference(),
    rentalId: reference()
      .notNull()
      .references(() => rentals.id),
    rentalItemId: reference()
      .notNull()
      .references(() => rentalItems.id),
    // The renter's photographs: a capture session of kind incident, locked and chained like any other.
    sessionId: reference()
      .notNull()
      .unique()
      .references(() => captureSessions.id),
    hint: incidentHint().notNull(),
    description: text().notNull(),
    language: text().notNull(),
    state: incidentState().notNull().default('reported'),
    kind: incidentKind(),
    // Code found words that could bear on safety. Such a report always goes to a person.
    safety: boolean().notNull().default(false),
    triageOutcome: triageOutcome(),
    triage: jsonb().$type<IncidentTriage>(),
    model: text(),
    promptVersion: text(),
    simulated: boolean().notNull().default(false),
    // The model's confirmation in the renter's language, kept only if it passed the number guard.
    confirmation: text(),
    currency: currency().notNull(),
    // The price list entry plain code matched the model's suggested code to, in the list the renter agreed to at booking.
    // Only a suggestion: nothing the renter can agree to.
    suggestedPriceEntryId: reference().references(() => priceEntries.id),
    // The entry a named staff member confirmed applies. Only this one can be agreed.
    offeredPriceEntryId: reference().references(() => priceEntries.id),
    offerConfirmedByUserId: reference().references(() => users.id),
    offerConfirmedAt: at(),
    // What the renter agreed with the one-time code: the entry and its amount, read from the database.
    agreedPriceEntryId: reference().references(() => priceEntries.id),
    agreedCents: cents(),
    agreedAt: at(),
    theftDetails: jsonb().$type<TheftDetails>(),
    staffAlertedAt: at(),
    reportedAt: createdAt(),
    // When the renter sent it. From then its photographs are closed, and staff see it even before it is sorted.
    sentAt: at(),
    sortedAt: at(),
    resolvedAt: at(),
  },
  (table) => [allowed(table.hint, INCIDENT_HINTS), allowed(table.kind, INCIDENT_KINDS), allowed(table.state, INCIDENT_STATES), allowed(table.triageOutcome, TRIAGE_OUTCOMES), shopIsolation(table.shopId)],
)
