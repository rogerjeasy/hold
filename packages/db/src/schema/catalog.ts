import { integer, jsonb, pgTable, text, unique } from 'drizzle-orm/pg-core'
import { PRICE_CATEGORIES } from '@hold/domain'
import { shopIsolation } from './access.ts'
import { at, cents, createdAt, currency, id, reference } from './columns.ts'
import { allowed, priceCategory } from './enums.ts'
import { shopReference } from './shops.ts'

// One view of a photo plan, in the order the camera asks for it.
export type PhotoPlanView = {
  readonly key: string
  readonly label: string
  readonly outline: string
  readonly required: boolean
}

export const photoPlans = pgTable(
  'photo_plans',
  {
    id: id(),
    shopId: shopReference(),
    name: text().notNull(),
    views: jsonb().$type<readonly PhotoPlanView[]>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [shopIsolation(table.shopId)],
)

export const itemTypes = pgTable(
  'item_types',
  {
    id: id(),
    shopId: shopReference(),
    name: text().notNull(),
    currency: currency().notNull(),
    valueCents: cents().notNull(),
    holdCents: cents().notNull(),
    photoPlanId: reference()
      .notNull()
      .references(() => photoPlans.id),
    createdAt: createdAt(),
  },
  (table) => [shopIsolation(table.shopId)],
)

export const items = pgTable(
  'items',
  {
    id: id(),
    shopId: shopReference(),
    itemTypeId: reference()
      .notNull()
      .references(() => itemTypes.id),
    label: text().notNull(),
    serial: text(),
    // The fingerprint of the latest sealed manifest. The next session's manifest names it, forming the item's chain.
    chainHeadFingerprint: text(),
    retiredAt: at(),
    createdAt: createdAt(),
  },
  (table) => [shopIsolation(table.shopId)],
)

// A version is drafted, then published. A rental keeps the version the renter agreed to, whatever is published later.
export const priceLists = pgTable(
  'price_lists',
  {
    id: id(),
    shopId: shopReference(),
    version: integer().notNull(),
    currency: currency().notNull(),
    publishedText: text(),
    publishedAt: at(),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.shopId, table.version), shopIsolation(table.shopId)],
)

export const priceEntries = pgTable(
  'price_entries',
  {
    id: id(),
    shopId: shopReference(),
    priceListId: reference()
      .notNull()
      .references(() => priceLists.id),
    code: text().notNull(),
    description: text().notNull(),
    currency: currency().notNull(),
    amountCents: cents().notNull(),
    category: priceCategory().notNull(),
    // The order the shop wrote its prices in, which is the order renters read them.
    position: integer().notNull().default(0),
  },
  (table) => [allowed(table.category, PRICE_CATEGORIES), unique().on(table.priceListId, table.code), shopIsolation(table.shopId)],
)

export const wearPolicies = pgTable(
  'wear_policies',
  {
    id: id(),
    shopId: shopReference(),
    version: integer().notNull(),
    rules: text().notNull(),
    publishedAt: at(),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.shopId, table.version), shopIsolation(table.shopId)],
)
