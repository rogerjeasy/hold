import 'server-only'
import { money, needsStrongSignIn, utcDay } from '@hold/domain'
import type { StaffRole } from '@hold/domain'
import { findPerson, inShop, shopSettings, staffRoleOf, takeRateToken } from '@hold/db'
import type { Person, RateLimit, ShopSettings, Transaction } from '@hold/db'
import { cache } from 'react'
import { z } from 'zod'
import { chosenShopId, hasSessionCookie, readAccessToken, sessionFactor } from '@/features/auth/session-cookies'
import type { SignInFactor } from '@/features/auth/session-cookies'
import { actInScope, failedFields, formObject, Refusal } from './action'
import { callerNetwork } from './network'
import { getServices } from './services'
import { currentBearer } from './staff-bearer'

// The one way into a shop, for every signed-in page and every server function that changes a shop. It does the
// steps of AGENTS.md section 7 in order: authenticate, resolve the shop and the caller's role, open the transaction
// with the caller's identity so row-level security applies, validate the input, act, and write the audit line.

// `bearer` is the phone's session (staff-bearer.ts), which is never proven by a passkey.
export type SessionFactor = SignInFactor | 'bearer'

export type ShopContext = {
  readonly subject: string
  readonly person: Person
  readonly shop: ShopSettings
  readonly role: StaffRole
  readonly approvalLimitCents: number
  readonly factor: SessionFactor
  // This person must confirm with a passkey before changing the shop, and this session has not. Always so for the
  // phone, whose session no passkey proves: every step that asks for one is refused there and done on the web.
  readonly passkeyNeeded: boolean
}

export type ShopAccess =
  | { readonly kind: 'signed_out' }
  | { readonly kind: 'no_shop'; readonly person: Person | undefined }
  | { readonly kind: 'in_shop'; readonly context: ShopContext }

// What a session presents, from the browser's cookies or the phone's bearer.
type Credential = {
  readonly accessToken: string
  readonly shopId: string | undefined
  // The browser falls back to the person's first shop; the phone must name one the person has a role in.
  readonly exactShop: boolean
  readonly factor: (subject: string) => Promise<SessionFactor>
}

// The one core both sessions share: the person the token names, their role in the shop, and their approval limit.
async function accessWith(credential: Credential): Promise<ShopAccess> {
  const { identity, database } = await getServices()
  const verified = await identity.verifyAccessToken(credential.accessToken)
  if (!verified.ok) return { kind: 'signed_out' }
  const person = await findPerson(database, verified.value.subject)
  if (person === undefined || person.shops.length === 0) return { kind: 'no_shop', person }
  const named = person.shops.find((shop) => shop.shopId === credential.shopId)
  const membership = credential.exactShop ? named : (named ?? person.shops[0])
  if (membership === undefined) return { kind: 'no_shop', person }
  const scope = { role: 'hold_app', shopId: membership.shopId, userId: person.userId } as const
  const loaded = await inShop(database, scope, async (transaction) => ({
    settings: await shopSettings(transaction, membership.shopId),
    staff: await staffRoleOf(transaction, person.userId),
  }))
  if (loaded.settings === undefined || loaded.staff === undefined) return { kind: 'no_shop', person }
  const factor = await credential.factor(verified.value.subject)
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
      passkeyNeeded: factor === 'bearer' || (strongNeeded && factor !== 'passkey'),
    },
  }
}

const bearerFactor = () => Promise.resolve('bearer' as const)

// Who is asking and in which shop. Pages call this to decide what to show. It changes nothing. Asked once per
// request: the shop's frame and the page both need it. Inside a phone route the bearer is the session, and a request
// that also carries a browser's session is refused, so one request never mixes two people.
export const shopAccess = cache(async (): Promise<ShopAccess> => {
  const bearer = currentBearer()
  if (bearer !== undefined) {
    if (await hasSessionCookie()) return { kind: 'signed_out' }
    return accessWith({ accessToken: bearer.accessToken, shopId: bearer.shopId, exactShop: true, factor: bearerFactor })
  }
  const accessToken = await readAccessToken()
  if (accessToken === undefined) return { kind: 'signed_out' }
  return accessWith({ accessToken, shopId: await chosenShopId(), exactShop: false, factor: sessionFactor })
})

export type ShopActionFailure = 'signed_out' | 'no_shop' | 'role' | 'passkey_needed' | 'invalid' | 'rate_limited'

export type ShopActionResult<Output> =
  | { readonly ok: true; readonly value: Output }
  | { readonly ok: false; readonly failure: ShopActionFailure; readonly fields?: readonly string[] }
  | { readonly ok: false; readonly failure: 'refused'; readonly reason: string }

export type ShopActionSpec<Input, Output = unknown> = {
  // Named in the audit line.
  readonly name: string
  readonly roles: readonly StaffRole[]
  // Changes that need the person proven by a passkey, when their role asks for one.
  readonly needsPasskey: boolean
  readonly input: z.ZodType<Input>
  // A limit on how often a shop may ask, for work that is costly to repeat, counted before the transaction opens.
  readonly rateLimit?: RateLimit
  // Shares of something every shop spends together, such as the account's daily Claude tokens: each is taken in a
  // short transaction of its own before the action's opens, and kept, so no lock is held while a model answers.
  readonly dailyCaps?: { readonly refusal: string; readonly shares: (context: ShopContext, network: string, day: string) => readonly { readonly limit: RateLimit; readonly subject: string }[] }
  // What the audit line says about the outcome beyond its name, such as the model an agent's turn asked.
  readonly auditDetail?: (output: Output) => Record<string, unknown>
}

// Work handed on once the change is committed, such as a message to the worker. Its outbox row is written with the
// change, so a failure here only waits for the relay; it is never the caller's failure.
export type AfterCommit<Output> = (context: ShopContext, output: Output) => Promise<void>

// Every server function built here, with who may call it. A test checks that each shop action file exports nothing
// else, and that the phone's list holds none that asks for a passkey.
type ShopActionCheck = Pick<ShopActionSpec<unknown>, 'name' | 'roles' | 'needsPasskey'>
const SHOP_ACTIONS = new WeakMap<object, ShopActionCheck>()

export function isShopAction(value: unknown): boolean {
  return typeof value === 'function' && SHOP_ACTIONS.has(value)
}

export function shopActionSpec(value: unknown): ShopActionCheck | undefined {
  return typeof value === 'function' ? SHOP_ACTIONS.get(value) : undefined
}

export function shopAction<Input, Output>(
  spec: ShopActionSpec<Input, Output>,
  act: (context: ShopContext, input: Input, transaction: Transaction) => Promise<Output | Refusal>,
  afterCommit?: AfterCommit<Output>,
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
    if (spec.rateLimit !== undefined && !(await takeRateToken((await getServices()).database, spec.rateLimit, context.shop.id))) return { ok: false, failure: 'rate_limited' }
    if (spec.dailyCaps !== undefined) {
      const { database } = await getServices()
      for (const share of spec.dailyCaps.shares(context, (await callerNetwork()) ?? 'unknown', utcDay(new Date()))) {
        if (!(await takeRateToken(database, share.limit, share.subject))) return { ok: false, failure: 'refused', reason: spec.dailyCaps.refusal }
      }
    }
    const scope = { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId } as const
    const result = await actInScope(
      scope,
      (transaction) => act(context, parsed.data, transaction),
      (output) => ({ actorKind: 'person', actorId: context.person.userId, action: spec.name, detail: { factor: context.factor, ...spec.auditDetail?.(output) } }),
    )
    if (result.ok && afterCommit !== undefined) {
      try {
        await afterCommit(context, result.value)
      } catch {
        // The outbox row written with the change hands the work on later.
      }
    }
    if (result.ok) {
      try { await (await getServices()).flushRecords(context.shop.id) } catch { /* The committed outbox retains failed document work. */ }
    }
    return result
  }
  SHOP_ACTIONS.set(action, { name: spec.name, roles: spec.roles, needsPasskey: spec.needsPasskey })
  return action
}

export { formObject, list, Refusal, withLocale } from './action'
