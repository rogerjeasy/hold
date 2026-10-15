import { ITEM_CATEGORIES, ITEM_STATUSES, PRICE_CATEGORIES } from '@hold/domain'
import type { Accessory, ViewOutline } from '@hold/domain'
import { sql } from 'drizzle-orm'
import { boolean, integer, jsonb, pgTable, text, unique, uniqueIndex } from 'drizzle-orm/pg-core'
import { shopIsolation } from './access.ts'
import { at, cents, createdAt, currency, id, reference } from './columns.ts'
import { allowed, itemCategory, itemStatus, priceCategory } from './enums.ts'
import { shopReference } from './shops.ts'

// One view of a photo plan, in the order the camera asks for it. Photographs are filed under its key.
export type PhotoPlanView = {
  readonly key: string
  readonly label: string
  readonly outline: ViewOutline
  readonly required: boolean
}

// A plan is never changed once saved: an edit to an item type's views saves a new plan, so every capture session
// keeps the plan it was taken with. The service roles may not update this table (migration 0010).
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
    category: itemCategory().notNull(),
    currency: currency().notNull(),
    // What it costs to replace. The hold is never above it.
    valueCents: cents().notNull(),
    holdCents: cents().notNull(),
    // The fee for one day. A rental's fee is worked out from it at booking, and kept on the rental.
    dayRateCents: cents().notNull(),
    // The kit handed over with each item and counted back at the return.
    accessories: jsonb().$type<readonly Accessory[]>().notNull().default([]),
    photoPlanId: reference()
      .notNull()
      .references(() => photoPlans.id),
    // Sample data added for a demonstration, shown as a sample wherever it appears.
    simulated: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    allowed(table.category, ITEM_CATEGORIES),
    // A shop's own types have distinct names, whatever their case. Sample types stand apart.
    uniqueIndex('item_types_shop_name_unique')
      .on(table.shopId, sql`lower(${table.name})`)
      .where(sql`not ${table.simulated}`),
    shopIsolation(table.shopId),
  ],
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
    size: text(),
    serial: text(),
    // What the shop says about the item. Whether it is out or booked comes from its rentals (domain item.ts).
    status: itemStatus().notNull().default('in_service'),
    // Why it went to repair or was retired, in the words of the person who said so.
    statusNote: text(),
    statusSince: at(),
    // The fingerprint of the latest sealed manifest. The next session's manifest names it, forming the item's chain.
    chainHeadFingerprint: text(),
    simulated: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    allowed(table.status, ITEM_STATUSES),
    uniqueIndex('items_shop_label_unique')
      .on(table.shopId, sql`lower(${table.label})`)
      .where(sql`not ${table.simulated}`),
    shopIsolation(table.shopId),
  ],
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
