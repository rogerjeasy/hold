import { checkSettlementLimits } from '@hold/domain'
import type { Mandate, ShopSettlementLimits } from '@hold/domain'
import { and, desc, eq, gt, inArray, isNull, lte } from 'drizzle-orm'
import { escalateNegotiation } from './negotiation-ending.ts'
import { mandates, negotiations, shops, staffRoles } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// The shop's advocate's mandate (extensions.md section 9.4): set by the owner in shop settings, with typed limits and
// an end date. Changing the limits revokes the mandate before and grants a new one, so a negotiation always names the
// limits it was held to.

export const SHOP_ADVOCATE = 'shop_advocate'
export const RENTER_ADVOCATE = 'renter_advocate'
// A renter's own assistant, named by its session, may be the agent of the renter's mandate instead of Hold's advocate
// (extensions.md section 9.11). The mandate then names that one session, on that one rental's claim.
const ASSISTANT_PREFIX = 'assistant:'
export const assistantAdvocate = (sessionId: string): string => `${ASSISTANT_PREFIX}${sessionId}`
export const isAssistantAdvocate = (agent: string): boolean => agent.startsWith(ASSISTANT_PREFIX)
// Whether Hold runs the side whose mandate names this agent.
export const isHoldAdvocate = (agent: string): boolean => agent === SHOP_ADVOCATE || agent === RENTER_ADVOCATE

export function mandateFromRow(row: typeof mandates.$inferSelect): Mandate {
  return { id: row.id, kind: row.kind, grantedTo: row.agent, validFrom: row.validFrom, validUntil: row.validUntil, revokedAt: row.revokedAt, limits: row.limits }
}

async function isOwner(transaction: Transaction, userId: string): Promise<boolean> {
  const [staff] = await transaction.select({ role: staffRoles.role }).from(staffRoles).where(eq(staffRoles.userId, userId))
  return staff?.role === 'owner'
}

export async function liveShopSettlement(transaction: Transaction, now: Date): Promise<Mandate | undefined> {
  const [row] = await transaction.select().from(mandates).where(and(eq(mandates.kind, 'settlement_shop'), isNull(mandates.revokedAt), lte(mandates.validFrom, now), gt(mandates.validUntil, now))).orderBy(desc(mandates.createdAt)).limit(1)
  return row === undefined ? undefined : mandateFromRow(row)
}

// Every negotiation still running or awaiting confirmation under a mandate goes to the owner when it ends.
async function endNegotiationsUnder(transaction: Transaction, mandateIds: readonly string[], now: Date) {
  if (mandateIds.length === 0) return
  const running = await transaction.select({ id: negotiations.id }).from(negotiations).where(and(inArray(negotiations.shopMandateId, [...mandateIds]), inArray(negotiations.state, ['open', 'agreed'])))
  for (const negotiation of running) await escalateNegotiation(transaction, negotiation.id, 'mandate_ended', now)
}

async function revokeLive(transaction: Transaction, now: Date) {
  const revoked = await transaction.update(mandates).set({ revokedAt: now }).where(and(eq(mandates.kind, 'settlement_shop'), isNull(mandates.revokedAt))).returning({ id: mandates.id })
  await endNegotiationsUnder(transaction, revoked.map((row) => row.id), now)
  return revoked
}

export async function grantShopSettlement(transaction: Transaction, userId: string, limits: Omit<ShopSettlementLimits, 'currency'>, days: number, now: Date) {
  if (!await isOwner(transaction, userId)) return { ok: false, reason: 'role_may_not_confirm' } as const
  const [shop] = await transaction.select({ id: shops.id, currency: shops.currency }).from(shops).limit(1)
  if (shop?.currency == null) return { ok: false, reason: 'no_currency' } as const
  const checked = checkSettlementLimits('settlement_shop', { currency: shop.currency, ...limits })
  if (!checked.ok || !Number.isSafeInteger(days) || days < 1 || days > 366) return { ok: false, reason: 'invalid_limits' } as const
  await revokeLive(transaction, now)
  const [row] = await transaction.insert(mandates).values({ shopId: shop.id, kind: 'settlement_shop', grantedByUserId: userId, agent: SHOP_ADVOCATE, limits: checked.value, validFrom: now, validUntil: new Date(now.getTime() + days * 24 * 3_600_000), grantedHow: 'on_screen', createdAt: now }).returning({ id: mandates.id })
  if (row === undefined) throw new Error('The mandate was not recorded.')
  return { ok: true, mandateId: row.id } as const
}

export async function revokeShopSettlement(transaction: Transaction, userId: string, now: Date) {
  if (!await isOwner(transaction, userId)) return { ok: false, reason: 'role_may_not_confirm' } as const
  await revokeLive(transaction, now)
  return { ok: true } as const
}
