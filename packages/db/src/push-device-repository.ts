import type { PushPlatform, StaffRole } from '@hold/domain'
import { and, eq, gt, inArray, isNull } from 'drizzle-orm'
import { pushDevices, renterLinks, shops, staffRoles } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// The phones registered for push notifications (architecture.md section 13.9). Nothing here sends: the caller pushes
// to the phones listed and records what Expo said.

export type PushRegistration = { readonly token: string; readonly platform: PushPlatform; readonly locale: string }

// A staff member's phone in one shop. Registering again turns it back on and keeps it current.
export async function registerStaffPush(transaction: Transaction, owner: { readonly shopId: string; readonly userId: string }, phone: PushRegistration, now: Date): Promise<void> {
  await transaction.insert(pushDevices)
    .values({ shopId: owner.shopId, userId: owner.userId, expoPushToken: phone.token, platform: phone.platform, locale: phone.locale, createdAt: now, lastUsedAt: now })
    .onConflictDoUpdate({ target: [pushDevices.expoPushToken, pushDevices.shopId, pushDevices.userId], set: { platform: phone.platform, locale: phone.locale, lastUsedAt: now, revokedAt: null } })
}

// A renter's phone for one rental, through the link it registered with. Registering again moves it to that link and
// keeps the reference the phone was first given, which is returned.
export async function registerRenterPush(transaction: Transaction, link: { readonly id: string; readonly shopId: string; readonly rentalId: string }, phone: PushRegistration, reference: string, now: Date): Promise<{ readonly reference: string }> {
  const [row] = await transaction.insert(pushDevices)
    .values({ shopId: link.shopId, rentalId: link.rentalId, renterLinkId: link.id, reference, expoPushToken: phone.token, platform: phone.platform, locale: phone.locale, createdAt: now, lastUsedAt: now })
    .onConflictDoUpdate({ target: [pushDevices.expoPushToken, pushDevices.rentalId], set: { renterLinkId: link.id, platform: phone.platform, locale: phone.locale, lastUsedAt: now, revokedAt: null } })
    .returning({ reference: pushDevices.reference })
  if (row?.reference == null) throw new Error('A renter’s phone was registered without a reference.')
  return { reference: row.reference }
}

export async function unregisterStaffPush(transaction: Transaction, userId: string, token: string, now: Date): Promise<void> {
  await transaction.update(pushDevices).set({ revokedAt: now }).where(and(eq(pushDevices.userId, userId), eq(pushDevices.expoPushToken, token), isNull(pushDevices.revokedAt)))
}

export async function unregisterRenterPush(transaction: Transaction, rentalId: string, token: string, now: Date): Promise<void> {
  await transaction.update(pushDevices).set({ revokedAt: now }).where(and(eq(pushDevices.rentalId, rentalId), eq(pushDevices.expoPushToken, token), isNull(pushDevices.revokedAt)))
}

const deviceColumns = { id: pushDevices.id, token: pushDevices.expoPushToken, locale: pushDevices.locale, pendingTicket: pushDevices.pendingTicket }

// The rental's phones still reachable: registered, not turned off, through a link that is still live. Undefined for a
// rental this shop does not have.
export async function renterPushTargets(transaction: Transaction, rentalId: string, now: Date) {
  const [shop] = await transaction.select({ name: shops.name }).from(renterLinks).innerJoin(shops, eq(shops.id, renterLinks.shopId)).where(eq(renterLinks.rentalId, rentalId)).limit(1)
  if (shop === undefined) return undefined
  const devices = await transaction.select({ ...deviceColumns, reference: pushDevices.reference })
    .from(pushDevices)
    .innerJoin(renterLinks, eq(renterLinks.id, pushDevices.renterLinkId))
    .where(and(eq(pushDevices.rentalId, rentalId), isNull(pushDevices.revokedAt), isNull(renterLinks.revokedAt), gt(renterLinks.expiresAt, now)))
  return { shopName: shop.name, devices: devices.map((device) => ({ ...device, reference: device.reference ?? '' })) }
}

// The phones of the people who hold one of the roles in the shop now. Undefined for a shop not in scope.
export async function staffPushTargets(transaction: Transaction, shopId: string, roles: readonly StaffRole[]) {
  const [shop] = await transaction.select({ name: shops.name }).from(shops).where(eq(shops.id, shopId))
  if (shop === undefined) return undefined
  const devices = await transaction.select(deviceColumns)
    .from(pushDevices)
    .innerJoin(staffRoles, and(eq(staffRoles.shopId, pushDevices.shopId), eq(staffRoles.userId, pushDevices.userId)))
    .where(and(eq(pushDevices.shopId, shopId), isNull(pushDevices.revokedAt), inArray(staffRoles.role, [...roles])))
  return { shopName: shop.name, devices }
}

// What Expo said: a ticket for each phone a push went to, and the phones that are gone, which are turned off.
export async function recordPushDelivery(transaction: Transaction, delivery: { readonly sent: readonly { readonly id: string; readonly ticket: string }[]; readonly gone: readonly string[] }, now: Date): Promise<void> {
  for (const sent of delivery.sent) await transaction.update(pushDevices).set({ pendingTicket: sent.ticket, lastUsedAt: now }).where(eq(pushDevices.id, sent.id))
  if (delivery.gone.length > 0) await transaction.update(pushDevices).set({ revokedAt: now, pendingTicket: null }).where(inArray(pushDevices.id, [...delivery.gone]))
}
