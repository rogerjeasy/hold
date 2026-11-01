import { PUSH_PLATFORMS } from '@hold/domain'
import { sql } from 'drizzle-orm'
import { check, pgTable, text, unique } from 'drizzle-orm/pg-core'
import { shopIsolation } from './access.ts'
import { at, createdAt, id, reference } from './columns.ts'
import { allowed } from './enums.ts'
import { renterLinks } from './messaging.ts'
import { rentals } from './rentals.ts'
import { shopReference, users } from './shops.ts'

// A phone that registered for push notifications in Hold's app (architecture.md section 13.9). It belongs either to a
// member of staff in this shop, or to a rental, through the renter link it registered with: renters have no account,
// so a renter's phone is reached only while that link is live. The reference is a random name for the rental the
// phone keeps beside its saved link, so a push names the rental without carrying the link.
export const pushDevices = pgTable(
  'push_devices',
  {
    id: id(),
    shopId: shopReference(),
    userId: reference().references(() => users.id),
    rentalId: reference().references(() => rentals.id),
    renterLinkId: reference().references(() => renterLinks.id),
    reference: text().unique(),
    expoPushToken: text().notNull(),
    platform: text().notNull(),
    locale: text().notNull(),
    // The last push's ticket, whose receipt is read before the next push (packages/notify push-delivery.ts).
    pendingTicket: text(),
    createdAt: createdAt(),
    lastUsedAt: at().notNull().defaultNow(),
    revokedAt: at(),
  },
  (table) => [
    allowed(table.platform, PUSH_PLATFORMS),
    check('staff_or_renter', sql`(${table.userId} is null) <> (${table.rentalId} is null)`),
    check('renter_through_link', sql`(${table.rentalId} is null) = (${table.renterLinkId} is null) and (${table.rentalId} is null) = (${table.reference} is null)`),
    unique('one_staff_registration').on(table.expoPushToken, table.shopId, table.userId),
    unique('one_renter_registration').on(table.expoPushToken, table.rentalId),
    shopIsolation(table.shopId),
  ],
)
