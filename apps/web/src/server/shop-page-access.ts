import 'server-only'
import { shopBySlug, takeRateToken } from '@hold/db'
import type { PublicShop, Transaction } from '@hold/db'
import { z } from 'zod'
import { actInScope, failedFields, formObject, Refusal } from './action'
import type { Refused } from './action'
import { callerNetwork } from './network'
import { getServices } from './services'

// The one way in for someone booking on a shop's own page, with nobody signed in. The network is rate limited, the
// shop is found by its address, the transaction is bound to that shop with no person named, the input is validated,
// then the work and its audit line. A booking keeps its items for fifteen minutes, so bookings are counted strictly.

const BOOKINGS = { name: 'shop-page-booking', max: 10, windowSeconds: 15 * 60 } as const

export type ShopPageActionResult<Output> =
  | { readonly ok: true; readonly value: Output }
  | { readonly ok: false; readonly failure: 'rate_limited' }
  | { readonly ok: false; readonly failure: 'invalid'; readonly fields: readonly string[] }
  | Refused

export type ShopPageActionSpec<Input> = { readonly name: string; readonly input: z.ZodType<Input> }

const SHOP_PAGE_ACTIONS = new WeakSet<object>()

export function isShopPageAction(value: unknown): boolean {
  return typeof value === 'function' && SHOP_PAGE_ACTIONS.has(value)
}

export function shopPageAction<Input extends { readonly shop: string }, Output>(
  spec: ShopPageActionSpec<Input>,
  act: (shop: PublicShop, input: Input, transaction: Transaction) => Promise<Output | Refusal>,
): (previous: unknown, data: FormData) => Promise<ShopPageActionResult<Output>> {
  const action = async (_previous: unknown, data: FormData): Promise<ShopPageActionResult<Output>> => {
    const { database } = await getServices()
    if (!(await takeRateToken(database, BOOKINGS, (await callerNetwork()) ?? 'local'))) return { ok: false, failure: 'rate_limited' }
    const parsed = spec.input.safeParse(formObject(data))
    if (!parsed.success) return { ok: false, failure: 'invalid', fields: failedFields(parsed.error) }
    const shop = await shopBySlug(database, parsed.data.shop)
    if (shop === undefined) return { ok: false, failure: 'refused', reason: 'not_found' }
    return actInScope(
      { role: 'hold_app', shopId: shop.id },
      (transaction) => act(shop, parsed.data, transaction),
      () => ({ actorKind: 'public', actorId: null, action: spec.name, subjectKind: 'shop', subjectId: shop.id }),
    )
  }
  SHOP_PAGE_ACTIONS.add(action)
  return action
}
