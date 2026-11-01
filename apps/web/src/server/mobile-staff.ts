import 'server-only'
import { inShop } from '@hold/db'
import type { Transaction } from '@hold/db'
import { STAFF_ACTIONS } from '@hold/mobile-api'
import type { StaffActionName } from '@hold/mobile-api'
import type { z } from 'zod'
import { answer, failed, formFromJson, readJsonObject } from './mobile-json'
import { getServices } from './services'
import { shopAccess } from './shop-access'
import type { ShopActionResult, ShopContext } from './shop-access'
import { bearerOf, withStaffBearer } from './staff-bearer'

// The one way into a shop for the phone (architecture.md section 13.7). A request names its person by a Cognito access
// token sent as a bearer and its shop by a header; everything after that is the web app's own: shopAccess resolves the
// person, the shop and the role, and each action is the web's own server function, built by shopAction, which checks
// the role and the passkey, validates the form, acts in the shop's transaction and writes the audit line.

type RouteContext<Params> = { readonly params: Promise<Params> }
type Route<Params> = (request: Request, context: RouteContext<Params>) => Promise<Response>
type ShopActionFunction = (previous: unknown, data: FormData) => Promise<ShopActionResult<unknown>>

// Every route built here. A test fails on any phone route that exports anything else.
const ROUTES = new WeakSet<object>()

export function isMobileStaffRoute(value: unknown): boolean {
  return typeof value === 'function' && ROUTES.has(value)
}

function route<Params>(handler: Route<Params>): Route<Params> {
  ROUTES.add(handler)
  return handler
}

const isListed = (name: string): name is StaffActionName => Object.hasOwn(STAFF_ACTIONS, name)

// POST /shop/actions/{name}: one of the counter's quick actions, from the explicit list. The JSON body becomes the form
// the web's page would send, and the answer is shaped by the contract's output schema, so nothing else reaches the phone.
export function staffActionRoute(actions: Readonly<Record<StaffActionName, ShopActionFunction>>): Route<{ action: string }> {
  return route(async (request, { params }) => {
    const { action: name } = await params
    if (!isListed(name)) return answer(failed('not_found'))
    const bearer = bearerOf(request.headers)
    if (bearer === undefined) return answer(failed('signed_out'))
    const body = await readJsonObject(request)
    if (body === undefined) return answer(failed('invalid', { fields: [] }))
    const form = formFromJson(body)
    if (!form.ok) return answer(failed('invalid', { fields: form.fields }))
    const result = await withStaffBearer(bearer, () => actions[name](null, form.form))
    if (!result.ok) return answer(result)
    return answer({ ok: true, value: STAFF_ACTIONS[name].output.parse(result.value) })
  })
}

export type StaffView<Params, Output extends z.ZodType> = {
  readonly output: Output
  // Nothing when what was asked for is not in this shop, which reads the same as one that does not exist.
  readonly load: (context: ShopContext, transaction: Transaction, request: Request, params: Params) => Promise<z.input<Output> | undefined>
}

// GET: something the phone reads, in the caller's shop with row-level security, shaped by the contract's schema.
export function staffReadRoute<Params, Output extends z.ZodType>(view: StaffView<Params, Output>): Route<Params> {
  return route(async (request, { params }) => {
    const bearer = bearerOf(request.headers)
    if (bearer === undefined) return answer(failed('signed_out'))
    return withStaffBearer(bearer, async () => {
      const access = await shopAccess()
      if (access.kind !== 'in_shop') return answer(failed(access.kind))
      const { context } = access
      const { database } = await getServices()
      const scope = { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId } as const
      const given = await params
      const value = await inShop(database, scope, (transaction) => view.load(context, transaction, request, given))
      return answer(value === undefined ? failed('not_found') : { ok: true, value: view.output.parse(value) })
    })
  })
}
