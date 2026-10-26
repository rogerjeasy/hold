import 'server-only'
import { RENTER_LINK_SCOPES } from '@hold/auth'
import type { RenterLinkScope } from '@hold/auth'
import { auditLog, findRenterLink, inShop, takeRateToken } from '@hold/db'
import type { RenterLink, Transaction } from '@hold/db'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { failedFields, formObject, Refusal } from './action'
import type { Refused } from './action'
import { callerNetwork } from './network'
import { renterTokenFingerprint } from './renter-links'
import { getServices } from './services'

// The one way in for a renter, who has no account and acts through a link (architecture.md section 12.3). Steps of
// AGENTS.md section 7 in order: the signed token is checked and rate limited, its link read, the link
// must be live and carry the scope, the transaction is bound to the link's shop with no person named, the input is
// validated, then the work and its audit line.

// A public route with two budgets. A token whose signature fails costs its network one of sixty a minute: that is
// someone guessing. A token Hold signed has six hundred a minute of its own, so renters sharing a hotel network, and
// pages that look again every few seconds, never lock each other out, and a flood on one link is still stopped.
const GUESSES = { name: 'renter-link', max: 60, windowSeconds: 60 } as const
const LINK_REQUESTS = { name: 'renter-link-signed', max: 600, windowSeconds: 60 } as const

export type RenterAccess = { readonly ok: true; readonly link: RenterLink } | { readonly ok: false; readonly failure: 'link_invalid' | 'scope' | 'rate_limited' }

// A changed, unknown, expired and revoked token all get the same answer, so the answer says nothing about which.
export async function renterAccess(token: string, scope: RenterLinkScope, now: Date): Promise<RenterAccess> {
  const { database } = await getServices()
  const fingerprint = await renterTokenFingerprint(token)
  if (fingerprint === undefined) {
    const allowed = await takeRateToken(database, GUESSES, (await callerNetwork()) ?? 'local')
    return { ok: false, failure: allowed ? 'link_invalid' : 'rate_limited' }
  }
  if (!(await takeRateToken(database, LINK_REQUESTS, fingerprint))) return { ok: false, failure: 'rate_limited' }
  const link = await findRenterLink(database, fingerprint)
  if (link === undefined || link.revokedAt !== null || link.expiresAt <= now) return { ok: false, failure: 'link_invalid' }
  if (!link.scopes.includes(scope)) return { ok: false, failure: 'scope' }
  return { ok: true, link }
}

export type RenterActionResult<Output> =
  | { readonly ok: true; readonly value: Output }
  | { readonly ok: false; readonly failure: 'link_invalid' | 'scope' | 'rate_limited' }
  | { readonly ok: false; readonly failure: 'invalid'; readonly fields: readonly string[] }
  | Refused

export type RenterActionSpec<Input> = { readonly name: string; readonly scope: RenterLinkScope; readonly input: z.ZodType<Input> }

const RENTER_ACTIONS = new WeakSet<object>()

export function isRenterAction(value: unknown): boolean {
  return typeof value === 'function' && RENTER_ACTIONS.has(value)
}

// Opens a transaction in the link's shop with no person named. A renter's work may need several, with a call to PayPal
// between them, which must never run inside one (architecture.md section 7.6).
export type InLinkShop = <Result>(work: (transaction: Transaction) => Promise<Result>) => Promise<Result>

export function renterAction<Input extends { readonly token: string }, Output>(
  spec: RenterActionSpec<Input>,
  act: (link: RenterLink, input: Input, inLinkShop: InLinkShop) => Promise<Output | Refusal>,
): (previous: unknown, data: FormData) => Promise<RenterActionResult<Output>> {
  if (!RENTER_LINK_SCOPES.includes(spec.scope)) throw new Error(`Unknown scope ${spec.scope}.`)
  const action = async (_previous: unknown, data: FormData): Promise<RenterActionResult<Output>> => {
    const fields = formObject(data)
    const access = await renterAccess(typeof fields['token'] === 'string' ? fields['token'] : '', spec.scope, new Date())
    if (!access.ok) return access
    const parsed = spec.input.safeParse(fields)
    if (!parsed.success) return { ok: false, failure: 'invalid', fields: failedFields(parsed.error) }
    const { link } = access
    const { database } = await getServices()
    const inLinkShop: InLinkShop = (work) => inShop(database, { role: 'hold_app', shopId: link.shopId }, work)
    const result = await act(link, parsed.data, inLinkShop)
    if (result instanceof Refusal) return { ok: false, failure: 'refused', reason: result.reason }
    // Written once the work is done, since the work may span several transactions.
    await inLinkShop((transaction) =>
      transaction.insert(auditLog).values({ shopId: link.shopId, actorKind: 'renter', actorId: link.id, action: spec.name, subjectKind: 'rental', subjectId: link.rentalId }),
    )
    try { await (await getServices()).flushRecords(link.shopId) } catch { /* The committed outbox retains failed document work. */ }
    revalidatePath('/', 'layout')
    return { ok: true, value: result }
  }
  RENTER_ACTIONS.add(action)
  return action
}

// The token travels with every renter form. The schema checks its shape; renterAccess checks the rest.
export const withToken = <Shape extends z.ZodRawShape>(shape: Shape) => z.object({ ...shape, token: z.string().min(1).max(200), locale: z.string().max(5) }).strict()
