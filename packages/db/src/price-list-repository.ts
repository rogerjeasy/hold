import { draftCodes, priceCode, publishedText } from '@hold/domain'
import type { Money, PriceCategory, PriceListDraft } from '@hold/domain'
import { and, asc, desc, eq, inArray, isNotNull, notInArray, sql } from 'drizzle-orm'
import { priceEntries, priceLists, rentals, shops, wearPolicies } from './schema/index.ts'
import type { Transaction } from './scope.ts'

export type PublishedPriceList = {
  readonly version: number
  readonly currency: string
  readonly publishedAt: Date
  readonly entries: readonly { readonly id: string; readonly code: string; readonly description: string; readonly category: PriceCategory; readonly amountCents: number }[]
  readonly wearPolicy: string
}

export type PublishResult = { readonly ok: true; readonly version: number } | { readonly ok: false; readonly reason: 'currency_fixed' }

// Publishes the next version of the shop's price list and wear policy, together. The first version sets the shop's
// currency, which then stays: earlier rentals were agreed in it. The approval threshold is set with it.
export async function publishPriceList(
  transaction: Transaction,
  shopId: string,
  draft: PriceListDraft & { readonly ownerApprovalThreshold: Money | undefined },
  now: Date,
): Promise<PublishResult> {
  const [shop] = await transaction.select({ currency: shops.currency }).from(shops).where(eq(shops.id, shopId))
  if (shop?.currency != null && shop.currency !== draft.currency) return { ok: false, reason: 'currency_fixed' }
  const [latest] = await transaction.select({ version: sql<number>`coalesce(max(${priceLists.version}), 0)::int` }).from(priceLists)
  const version = (latest?.version ?? 0) + 1

  const [list] = await transaction
    .insert(priceLists)
    .values({ shopId, version, currency: draft.currency, publishedText: publishedText(draft), publishedAt: now })
    .returning({ id: priceLists.id })
  if (list === undefined) throw new Error('The price list was not created.')
  // Two descriptions can make one code: the later one is numbered, as the editor showed it.
  const codes = draftCodes(draft.entries.map((entry) => entry.description))
  await transaction.insert(priceEntries).values(
    draft.entries.map((entry, index) => {
      return {
        shopId,
        priceListId: list.id,
        code: codes[index] ?? priceCode(entry.description, index),
        description: entry.description.trim(),
        category: entry.category,
        currency: draft.currency,
        amountCents: entry.amount.cents,
        position: index,
      }
    }),
  )
  await transaction.insert(wearPolicies).values({ shopId, version, rules: draft.wearPolicy.trim(), publishedAt: now })
  await transaction
    .update(shops)
    .set({ currency: draft.currency, ownerApprovalThresholdCents: draft.ownerApprovalThreshold?.cents ?? null })
    .where(eq(shops.id, shopId))
  return { ok: true, version }
}

export async function currentPriceList(transaction: Transaction): Promise<PublishedPriceList | undefined> {
  const [list] = await transaction
    .select({ id: priceLists.id, version: priceLists.version, currency: priceLists.currency, publishedAt: priceLists.publishedAt })
    .from(priceLists)
    .where(isNotNull(priceLists.publishedAt))
    .orderBy(desc(priceLists.version))
    .limit(1)
  if (list?.publishedAt == null) return undefined
  const entries = await transaction
    .select({ id: priceEntries.id, code: priceEntries.code, description: priceEntries.description, category: priceEntries.category, amountCents: priceEntries.amountCents })
    .from(priceEntries)
    .where(eq(priceEntries.priceListId, list.id))
    .orderBy(asc(priceEntries.position))
  const [wear] = await transaction
    .select({ rules: wearPolicies.rules })
    .from(wearPolicies)
    .where(and(eq(wearPolicies.version, list.version), isNotNull(wearPolicies.publishedAt)))
  return { version: list.version, currency: list.currency, publishedAt: list.publishedAt, entries, wearPolicy: wear?.rules ?? '' }
}

export type PriceListVersion = {
  readonly version: number
  readonly currency: string
  readonly publishedAt: Date
  readonly entries: readonly { readonly description: string; readonly category: PriceCategory; readonly amountCents: number }[]
  readonly wearPolicy: string
  // Rentals not yet closed, cancelled or let go that were agreed to this version: the renters held to it.
  readonly liveRentals: number
}

const ENDED_RENTALS = ['closed', 'cancelled', 'abandoned'] as const

// Every published version of the shop's terms, newest first, for the editor's versions and its diff.
export async function priceListVersions(transaction: Transaction): Promise<PriceListVersion[]> {
  const lists = await transaction
    .select({ id: priceLists.id, version: priceLists.version, currency: priceLists.currency, publishedAt: priceLists.publishedAt })
    .from(priceLists)
    .where(isNotNull(priceLists.publishedAt))
    .orderBy(desc(priceLists.version))
  if (lists.length === 0) return []
  const ids = lists.map((list) => list.id)
  const entries = await transaction
    .select({ priceListId: priceEntries.priceListId, description: priceEntries.description, category: priceEntries.category, amountCents: priceEntries.amountCents })
    .from(priceEntries)
    .where(inArray(priceEntries.priceListId, ids))
    .orderBy(asc(priceEntries.position))
  const wear = await transaction.select({ version: wearPolicies.version, rules: wearPolicies.rules }).from(wearPolicies).where(isNotNull(wearPolicies.publishedAt))
  const live = await transaction
    .select({ priceListId: rentals.priceListId, count: sql<number>`count(*)::int` })
    .from(rentals)
    .where(and(inArray(rentals.priceListId, ids), notInArray(rentals.state, [...ENDED_RENTALS])))
    .groupBy(rentals.priceListId)
  return lists.flatMap((list) => (list.publishedAt === null ? [] : [{
    version: list.version,
    currency: list.currency,
    publishedAt: list.publishedAt,
    entries: entries.filter((entry) => entry.priceListId === list.id).map(({ description, category, amountCents }) => ({ description, category, amountCents })),
    wearPolicy: wear.find((each) => each.version === list.version)?.rules ?? '',
    liveRentals: live.find((each) => each.priceListId === list.id)?.count ?? 0,
  }]))
}
