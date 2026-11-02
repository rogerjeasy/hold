import type { Region } from '@hold/domain'
import type { EvidenceSnapshot } from '../evidence-snapshot-schema.ts'
import { sql } from 'drizzle-orm'
import { boolean, integer, jsonb, pgTable, real, text, unique, uniqueIndex } from 'drizzle-orm/pg-core'
import { shopIsolation } from './access.ts'
import { items, photoPlans, priceEntries } from './catalog.ts'
import { at, createdAt, id, reference } from './columns.ts'
import { incidents } from './incidents.ts'
import { allowed, CAPTURE_SESSION_KINDS, captureSessionKind, COMPARISON_STATES, comparisonState, FINDING_CLASSES, findingClass, MARK_STATUSES, markStatus, PHOTO_SOURCES, photoSource } from './enums.ts'
import { rentalItems, rentals } from './rentals.ts'
import { shopReference, users } from './shops.ts'

export type { Region }


export const captureSessions = pgTable(
  'capture_sessions',
  {
    id: id(),
    shopId: shopReference(),
    rentalItemId: reference()
      .notNull()
      .references(() => rentalItems.id),
    kind: captureSessionKind().notNull(),
    // The plan the photographs were taken to. A return is compared view by view with a handover of the same plan.
    photoPlanId: reference()
      .notNull()
      .references(() => photoPlans.id),
    // A staff member, or nobody when the renter took the photographs through their link.
    actorUserId: reference().references(() => users.id),
    // A return the renter photographed through their link with nobody at the counter (architecture.md section 6.13).
    byRenter: boolean().notNull().default(false),
    startedAt: createdAt(),
    sealedAt: at(),
    // The sealed manifest's exact text (domain manifestText). Its SHA-256 is the fingerprint the item's next session names.
    manifest: text(),
    manifestFingerprint: text(),
    previousManifestFingerprint: text(),
    // The item's known marks staff confirmed were still there at this session.
    confirmedMarkIds: jsonb().$type<readonly string[]>().notNull().default([]),
  },
  (table) => [allowed(table.kind, CAPTURE_SESSION_KINDS), shopIsolation(table.shopId)],
)

export const photos = pgTable(
  'photos',
  {
    id: id(),
    shopId: shopReference(),
    sessionId: reference()
      .notNull()
      .references(() => captureSessions.id),
    view: text().notNull(),
    // The locked original in the evidence bucket. Never shown directly.
    evidenceKey: text().notNull().unique(),
    // The smaller, face-blurred copy people see. Written by the worker after the upload.
    displayKey: text(),
    sha256: text().notNull(),
    perceptualHash: text(),
    // When the server received it, not the phone's clock.
    receivedAt: at().notNull(),
    quality: jsonb().$type<Readonly<Record<string, number>>>(),
    // How it was taken: Hold's live camera or a chosen file, as the capture screen reported, or one of the
    // demonstration's samples, known by fingerprint. Null for photographs recorded before sources were kept.
    source: photoSource(),
    // Set when a retake before sealing took this photograph's place. The photograph itself stays locked and on record.
    supersededAt: at(),
  },
  (table) => [uniqueIndex('photos_current_view_unique').on(table.sessionId, table.view).where(sql`${table.supersededAt} is null`), allowed(table.source, PHOTO_SOURCES), shopIsolation(table.shopId)],
)

export const marks = pgTable(
  'marks',
  {
    id: id(),
    shopId: shopReference(),
    itemId: reference()
      .notNull()
      .references(() => items.id),
    view: text().notNull(),
    region: jsonb().$type<Region>().notNull(),
    description: text().notNull(),
    firstSeenSessionId: reference()
      .notNull()
      .references(() => captureSessions.id),
    status: markStatus().notNull().default('open'),
    // The report it was first seen in, when a renter reported it during the rental.
    incidentId: reference().references(() => incidents.id),
    closedAt: at(),
    // The repair that closed it, whose photographs are its evidence (architecture.md section 9.6).
    repairId: reference(),
  },
  (table) => [allowed(table.status, MARK_STATUSES), shopIsolation(table.shopId)],
)

export const comparisons = pgTable(
  'comparisons',
  {
    id: id(),
    shopId: shopReference(),
    handoverSessionId: reference()
      .notNull()
      .references(() => captureSessions.id),
    returnSessionId: reference()
      .notNull()
      .unique()
      .references(() => captureSessions.id),
    state: comparisonState().notNull().default('pending'),
    alignment: jsonb().$type<Readonly<Record<string, number>>>(),
    model: text(),
    promptVersion: text(),
    // A bounded lease lets a queue retry recover a worker that stopped mid-comparison.
    startedAt: at(),
    deferredReason: text(),
    simulated: boolean().notNull().default(false),
    createdAt: createdAt(),
    completedAt: at(),
  },
  (table) => [allowed(table.state, COMPARISON_STATES), shopIsolation(table.shopId)],
)

export const findings = pgTable(
  'findings',
  {
    id: id(),
    shopId: shopReference(),
    comparisonId: reference()
      .notNull()
      .references(() => comparisons.id),
    view: text().notNull(),
    region: jsonb().$type<Region>().notNull(),
    class: findingClass().notNull(),
    confidence: real().notNull(),
    description: text().notNull(),
    secondLookConfirmed: boolean(),
    matchedMarkId: reference().references(() => marks.id),
    // The model may suggest which entry applies. The amount always comes from the entry itself.
    suggestedPriceEntryId: reference().references(() => priceEntries.id),
  },
  (table) => [allowed(table.class, FINDING_CLASSES), shopIsolation(table.shopId)],
)

export const evidencePacks = pgTable(
  'evidence_packs',
  {
    id: id(),
    shopId: shopReference(),
    rentalId: reference()
      .notNull()
      .references(() => rentals.id),
    version: integer().notNull(),
    evidenceKey: text().notNull().unique(),
    manifestFingerprint: text().notNull(),
    snapshot: jsonb().$type<EvidenceSnapshot>().notNull(),
    sourceFingerprint: text().notNull(),
    state: text().notNull().default('building'),
    rendererVersion: text().notNull().default('evidence-v1'),
    pdfSha256: text(),
    pdfVersionId: text(),
    manifestVersionId: text(),
    snapshotVersionId: text(),
    lastError: text(),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.rentalId, table.version), unique().on(table.rentalId, table.sourceFingerprint), shopIsolation(table.shopId)],
)
