import { FINDING_VERDICTS } from '@hold/domain'
import type { GateLimits, Measures } from '@hold/domain'
import { sql } from 'drizzle-orm'
import { boolean, integer, jsonb, pgPolicy, pgTable, text, unique } from 'drizzle-orm/pg-core'
import { appRole, evalRole, shopIsolation, workerRole } from './access.ts'
import { at, createdAt, id, reference } from './columns.ts'
import { allowed, EVALUATION_HALVES, evaluationHalf, findingVerdict } from './enums.ts'
import { claims } from './claims.ts'
import { findings } from './evidence.ts'
import { rentals } from './rentals.ts'
import { shopReference, users } from './shops.ts'

// One run of the comparison over the evaluation set (extensions.md section 5). It belongs to no shop: the scorecard
// is public. Only the evaluation runner writes it, as hold_eval or the owner, and nobody changes it afterwards
// except the owner accepting it.
export const evalRuns = pgTable(
  'eval_runs',
  {
    id: id(),
    half: evaluationHalf().notNull(),
    // A fingerprint of the manifest and every photograph it names.
    dataSetVersion: text().notNull(),
    // The comparison code's commit, with the model and prompt it called.
    pipelineVersion: text().notNull(),
    model: text().notNull(),
    promptVersion: text().notNull(),
    thresholds: jsonb().$type<Readonly<Record<string, number>>>().notNull(),
    caseCount: integer().notNull(),
    syntheticCount: integer().notNull(),
    measures: jsonb().$type<Measures>().notNull(),
    // The same measures over the photographs taken as they are, without the synthetic pairs.
    realMeasures: jsonb().$type<Measures>().notNull(),
    gateLimits: jsonb().$type<GateLimits | null>(),
    gatePassed: boolean().notNull(),
    gateReasons: jsonb().$type<readonly string[]>().notNull().default([]),
    // An accepted run is the one the next run is compared against, and the one the scorecard shows.
    accepted: boolean().notNull().default(false),
    resultsKey: text().notNull(),
    startedAt: at().notNull(),
    completedAt: createdAt(),
  },
  (table) => [allowed(table.half, EVALUATION_HALVES), pgPolicy('eval_runs_readable', { for: 'select', to: [appRole, workerRole, evalRole], using: sql`true` }), pgPolicy('eval_runs_recorded', { for: 'insert', to: [evalRole], withCheck: sql`not ${table.accepted}` })],
)

// What a person finally did with each finding the comparison raised: the field record (section 5.7). Append-only.
export const findingOutcomes = pgTable(
  'finding_outcomes',
  {
    id: id(),
    shopId: shopReference(),
    rentalId: reference()
      .notNull()
      .references(() => rentals.id),
    findingId: reference()
      .notNull()
      .references(() => findings.id),
    claimId: reference().references(() => claims.id),
    verdict: findingVerdict().notNull(),
    decidedByUserId: reference().references(() => users.id),
    decidedAt: at().notNull(),
    createdAt: createdAt(),
  },
  (table) => [allowed(table.verdict, FINDING_VERDICTS), unique().on(table.findingId), shopIsolation(table.shopId)],
)
