import { and, eq, sql } from 'drizzle-orm'
import { paypalAccounts, shops } from './schema/index.ts'
import { outsideShop } from './scope.ts'
import type { Database, Transaction } from './scope.ts'

export type ShopSettings = {
  readonly id: string
  readonly name: string
  // The shop's page for renters is /s/{slug}.
  readonly slug: string
  readonly timeZone: string
  readonly currency: string | null
  readonly ownerApprovalThresholdCents: number | null
}

export async function shopSettings(transaction: Transaction, shopId: string): Promise<ShopSettings | undefined> {
  const [shop] = await transaction
    .select({ id: shops.id, name: shops.name, slug: shops.slug, timeZone: shops.timeZone, currency: shops.currency, ownerApprovalThresholdCents: shops.ownerApprovalThresholdCents })
    .from(shops)
    .where(eq(shops.id, shopId))
  return shop
}

export type PayPalMode = 'sandbox' | 'live'

// Records where the shop's PayPal credentials are kept. Connecting again replaces the reference.
export async function savePayPalAccount(transaction: Transaction, shopId: string, mode: PayPalMode, credentialReference: string): Promise<void> {
  await transaction
    .insert(paypalAccounts)
    .values({ shopId, mode, credentialReference })
    .onConflictDoUpdate({ target: [paypalAccounts.shopId, paypalAccounts.mode], set: { credentialReference } })
}

export async function findPayPalAccount(transaction: Transaction, shopId: string, mode: PayPalMode) {
  const [account] = await transaction
    .select({ id: paypalAccounts.id, credentialReference: paypalAccounts.credentialReference, createdAt: paypalAccounts.createdAt })
    .from(paypalAccounts)
    .where(and(eq(paypalAccounts.shopId, shopId), eq(paypalAccounts.mode, mode)))
  return account
}

export type PublicShop = { readonly id: string; readonly name: string; readonly currency: string | null; readonly timeZone: string }

// The shop a public page names by its address, read before any shop is chosen. Nothing for an unknown address.
export async function shopBySlug(database: Database, slug: string): Promise<PublicShop | undefined> {
  const [shop] = await outsideShop(database, (transaction) =>
    transaction
      .select({ id: sql<string>`shop.id`, name: sql<string>`shop.name`, currency: sql<string | null>`shop.currency`, timeZone: sql<string>`shop.time_zone` })
      .from(sql`hold_shop_by_slug(${slug}) as shop`),
  )
  return shop
}
