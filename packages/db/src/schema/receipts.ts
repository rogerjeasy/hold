import { integer, pgTable, text, unique } from 'drizzle-orm/pg-core'
import { shopIsolation } from './access.ts'
import { at, cents, createdAt, currency, id, reference } from './columns.ts'
import { evidencePacks } from './evidence.ts'
import { moneyEvents } from './money.ts'
import { rentals, renters } from './rentals.ts'
import { shopReference } from './shops.ts'

export const receiptDeliveries = pgTable('receipt_deliveries', {
  id: id(), shopId: shopReference(), rentalId: reference().notNull().references(() => rentals.id),
  packId: reference().notNull().references(() => evidencePacks.id),
  eventId: reference().notNull().references(() => moneyEvents.id),
  renterId: reference().references(() => renters.id),
  language: text().notNull(), kind: text().notNull(),
  amountCents: cents().notNull(), releasedCents: cents().notNull(), currency: currency().notNull(),
  paypalReference: text().notNull(), status: text().notNull().default('queued'),
  leaseOwner: text(), leaseUntil: at(), attempts: integer().notNull().default(0),
  lastError: text(), sentAt: at(), createdAt: createdAt(),
}, (table) => [unique().on(table.eventId), shopIsolation(table.shopId)])
