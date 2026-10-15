import 'server-only'
import { money, needsStrongSignIn } from '@hold/domain'
import type { StaffRole } from '@hold/domain'
import { findPerson, inShop, shopSettings, staffRoleOf } from '@hold/db'
import type { Person, ShopSettings, Transaction } from '@hold/db'
import { cache } from 'react'
import { z } from 'zod'
import { chosenShopId, readAccessToken, sessionFactor } from '@/features/auth/session-cookies'
import type { SignInFactor } from '@/features/auth/session-cookies'
import { actInScope, failedFields, formObject, Refusal } from './action'
import { getServices } from './services'

// The one way into a shop, for every signed-in page and every server function that changes a shop. It does the
// steps of AGENTS.md section 7 in order: authenticate, resolve the shop and the caller's role, open the transaction
// with the caller's identity so row-level security applies, validate the input, act, and write the audit line.

export type ShopContext = {
  readonly subject: string
  readonly person: Person
  readonly shop: ShopSettings
  readonly role: StaffRole
  readonly approvalLimitCents: number
  readonly factor: SignInFactor
  // This person must confirm with a passkey before changing the shop, and this session has not.
  readonly passkeyNeeded: boolean
}

export type ShopAccess =
  | { readonly kind: 'signed_out' }
  | { readonly kind: 'no_shop'; readonly person: Person | undefined }
  | { readonly kind: 'in_shop'; readonly context: ShopContext }

// Who is asking and in which shop. Pages call this to decide what to show. It changes nothing. Asked once per
// request: the shop's frame and the page both need it.
export const shopAccess = cache(async (): Promise<ShopAccess> => {
  const accessToken = await readAccessToken()
  if (accessToken === undefined) return { kind: 'signed_out' }
  const { identity, database } = await getServices()
  const verified = await identity.verifyAccessToken(accessToken)
  if (!verified.ok) return { kind: 'signed_out' }
  const person = await findPerson(database, verified.value.subject)
  if (person === undefined || person.shops.length === 0) return { kind: 'no_shop', person }
  const chosen = await chosenShopId()
  const membership = person.shops.find((shop) => shop.shopId === chosen) ?? person.shops[0]
  if (membership === undefined) return { kind: 'no_shop', person }
  const scope = { role: 'hold_app', shopId: membership.shopId, userId: person.userId } as const
  const loaded = await inShop(database, scope, async (transaction) => ({
    settings: await shopSettings(transaction, membership.shopId),
    staff: await staffRoleOf(transaction, person.userId),
  }))
  if (loaded.settings === undefined || loaded.staff === undefined) return { kind: 'no_shop', person }
  const factor = await sessionFactor(verified.value.subject)
  const threshold = loaded.settings.ownerApprovalThresholdCents
  const currency = loaded.settings.currency ?? 'XXX'
  const strongNeeded = needsStrongSignIn(loaded.staff.role, money(loaded.staff.approvalLimitCents, currency), threshold === null ? undefined : money(threshold, currency))
  return {
    kind: 'in_shop',
    context: {
      subject: verified.value.subject,
      person,
      shop: loaded.settings,
      role: loaded.staff.role,
      approvalLimitCents: loaded.staff.approvalLimitCents,
      factor,
      passkeyNeeded: strongNeeded && factor !== 'passkey',
    },
  }
})

export type ShopActionFailure = 'signed_out' | 'no_shop' | 'role' | 'passkey_needed' | 'invalid'

export type ShopActionResult<Output> =
  | { readonly ok: true; readonly value: Output }
  | { readonly ok: false; readonly failure: ShopActionFailure; readonly fields?: readonly string[] }
  | { readonly ok: false; readonly failure: 'refused'; readonly reason: string }

export type ShopActionSpec<Input> = {
  // Named in the audit line.
  readonly name: string
  readonly roles: readonly StaffRole[]
  // Changes that need the person proven by a passkey, when their role asks for one.
  readonly needsPasskey: boolean
  readonly input: z.ZodType<Input>
}

// Every server function built here. A test checks that each shop action file exports nothing else.
const SHOP_ACTIONS = new WeakSet<object>()

export function isShopAction(value: unknown): boolean {
  return typeof value === 'function' && SHOP_ACTIONS.has(value)
}

export function shopAction<Input, Output>(
  spec: ShopActionSpec<Input>,
  act: (context: ShopContext, input: Input, transaction: Transaction) => Promise<Output | Refusal>,
): (previous: unknown, data: FormData) => Promise<ShopActionResult<Output>> {
  const action = async (_previous: unknown, data: FormData): Promise<ShopActionResult<Output>> => {
    const access = await shopAccess()
    if (access.kind === 'signed_out') return { ok: false, failure: 'signed_out' }
    if (access.kind === 'no_shop') return { ok: false, failure: 'no_shop' }
    const { context } = access
    if (!spec.roles.includes(context.role)) return { ok: false, failure: 'role' }
    if (spec.needsPasskey && context.passkeyNeeded) return { ok: false, failure: 'passkey_needed' }
    const parsed = spec.input.safeParse(formObject(data))
    if (!parsed.success) return { ok: false, failure: 'invalid', fields: failedFields(parsed.error) }
    const scope = { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId } as const
    return actInScope(
      scope,
      (transaction) => act(context, parsed.data, transaction),
      () => ({ actorKind: 'person', actorId: context.person.userId, action: spec.name, detail: { factor: context.factor } }),
    )
  }
  SHOP_ACTIONS.add(action)
  return action
}

export { formObject, list, Refusal, withLocale } from './action'
