import { agentSessionLive, ASSISTANT_LIMITS, gatewayDecision } from '@hold/domain'
import type { AgentActor, GatewayDecision } from '@hold/domain'
import { auditLog, quoteShop, rentals, sessionByBookingSecret, sessionByToken, shopBySlug, takeRateToken, touchAgentSession } from '@hold/db'
import { eq } from 'drizzle-orm'
import { TOOLS } from './catalogue.ts'
import type { ToolName } from './catalogue.ts'
import { inShopOf } from './ports.ts'
import { checkAvailability, createBooking, findShops, getBooking, getDamagePrices, getShop, quoteRental } from './public-tools.ts'
import type { Caller, Handled, ShopSubject } from './public-tools.ts'
import { claimNeedsThePerson, draftClaimReply, getClaim, getConditionReport, getHold, getHoldApprovalLink, getRecord, getRental } from './rental-tools.ts'
import type { RentalSubject } from './rental-tools.ts'
import { readSecret } from './secrets.ts'

// Every call from every assistant takes this one path (extensions.md section 4.4): the actor and the shop are resolved,
// the rate is counted, the gateway decides on actor, shop, rental, tier, mandate, rate and argument shape, the tool
// runs, and one audit line is written in the shop with the actor, tool, subject, outcome and duration. A call that
// names no shop, such as find_shops or an unknown token, goes to the application log instead.

export type ToolResult = { readonly ok: true; readonly output: Readonly<Record<string, unknown>>; readonly image?: string } | { readonly ok: false; readonly error: string }

const PUBLIC = { name: 'assistant-public', max: ASSISTANT_LIMITS.publicCallsPerMinute, windowSeconds: 60 } as const
const RENTAL = { name: 'assistant-rental', max: ASSISTANT_LIMITS.rentalCallsPerMinute, windowSeconds: 60 } as const

// Every refusal about who is calling gets one answer, so it says nothing about which check failed.
const NOT_AUTHORIZED = 'not_authorized'

type Resolved =
  | { readonly kind: 'public'; readonly actor: AgentActor; readonly shop: ShopSubject | undefined; readonly session: { readonly sessionId: string; readonly shopId: string; readonly rentalId: string } | undefined; readonly quoteShopId: string | undefined }
  // The rental the call names, and the one the token is bound to: the gateway refuses the call when they differ.
  | { readonly kind: 'rental'; readonly actor: AgentActor; readonly subject: RentalSubject; readonly boundRentalId: string; readonly live: boolean }
  | { readonly kind: 'unresolved'; readonly reason: string; readonly shopId?: string; readonly sessionId?: string }

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const PUBLIC_AGENT: AgentActor = { kind: 'public_agent', shopId: null, actsFor: null }

async function resolveShop(caller: Caller, slug: string): Promise<ShopSubject | undefined> {
  const shop = await shopBySlug(caller.ports.database, slug)
  return shop === undefined || shop.currency === null ? undefined : { shopId: shop.id, slug, timeZone: shop.timeZone, currency: shop.currency }
}

async function resolve(caller: Caller, name: ToolName, args: Readonly<Record<string, unknown>>): Promise<Resolved> {
  const { ports } = caller
  if (TOOLS[name].audience === 'public') {
    const shop = 'shop' in TOOLS[name].input.shape && text(args['shop']) !== '' ? await resolveShop(caller, text(args['shop'])) : undefined
    const fingerprint = name === 'get_booking' ? readSecret(ports.secret, 'booking_secret', text(args['booking_secret'])) : undefined
    const session = fingerprint === undefined ? undefined : await sessionByBookingSecret(ports.database, fingerprint)
    const quoteShopId = name === 'create_booking' ? await quoteShop(ports.database, text(args['quote_id'])) : undefined
    return { kind: 'public', actor: PUBLIC_AGENT, shop, session, quoteShopId }
  }
  const fingerprint = readSecret(ports.secret, 'agent_token', text(args['agent_token']))
  const session = fingerprint === undefined ? undefined : await sessionByToken(ports.database, fingerprint)
  if (session === undefined) return { kind: 'unresolved', reason: 'token_unknown' }
  // The audience check above leaves only rental tools here, each of which names its scope.
  const { scope } = TOOLS[name]
  if (!session.scopes.includes(scope)) return { kind: 'unresolved', reason: 'scope', shopId: session.shopId, sessionId: session.id }
  // The person the assistant acts for: the PayPal payer who paid the fee.
  const [rental] = await inShopOf(ports, session.shopId, (transaction) => transaction.select({ renterId: rentals.renterId }).from(rentals).where(eq(rentals.id, session.rentalId)))
  return {
    kind: 'rental',
    actor: { kind: 'renter_agent', shopId: session.shopId, actsFor: rental?.renterId ?? null, rentalId: session.rentalId },
    subject: { shopId: session.shopId, rentalId: text(args['rental_id']), sessionId: session.id },
    boundRentalId: session.rentalId,
    live: agentSessionLive(session, ports.now()),
  }
}

// The shop a call is about, which its audit line goes to.
function subjectShop(resolved: Resolved): string | undefined {
  if (resolved.kind === 'rental') return resolved.subject.shopId
  if (resolved.kind === 'unresolved') return resolved.shopId
  return resolved.shop?.shopId ?? resolved.session?.shopId ?? resolved.quoteShopId
}

async function handle(caller: Caller, name: ToolName, input: Readonly<Record<string, unknown>>, resolved: Resolved): Promise<Handled<Readonly<Record<string, unknown>>>> {
  if (resolved.kind === 'rental') {
    const { subject } = resolved
    switch (name) {
      case 'get_rental':
        return getRental(caller, subject)
      case 'get_hold':
        return getHold(caller, subject)
      case 'get_hold_approval_link':
        return getHoldApprovalLink(caller, subject)
      case 'get_condition_report':
        return getConditionReport(caller, subject)
      case 'get_claim':
        return getClaim(caller, subject)
      case 'draft_claim_reply':
        return draftClaimReply(caller, subject, TOOLS.draft_claim_reply.input.parse(input))
      case 'get_record':
        return getRecord(caller, subject)
      default:
        return { ok: false, reason: 'unknown_tool' }
    }
  }
  if (resolved.kind !== 'public') return { ok: false, reason: NOT_AUTHORIZED }
  if (name === 'find_shops') return findShops(caller, TOOLS.find_shops.input.parse(input))
  if (name === 'create_booking') return resolved.quoteShopId === undefined ? { ok: false, reason: 'quote_not_found' } : createBooking(caller, resolved.quoteShopId, TOOLS.create_booking.input.parse(input))
  if (name === 'get_booking') return resolved.session === undefined ? { ok: false, reason: 'booking_not_found' } : getBooking(caller, resolved.session)
  const { shop } = resolved
  if (shop === undefined) return { ok: false, reason: 'shop_not_found' }
  if (name === 'get_shop') return getShop(caller, shop)
  if (name === 'check_availability') return checkAvailability(caller, shop, TOOLS.check_availability.input.parse(input))
  if (name === 'get_damage_prices') return getDamagePrices(caller, shop)
  if (name === 'quote_rental') return quoteRental(caller, shop, TOOLS.quote_rental.input.parse(input))
  return { ok: false, reason: 'unknown_tool' }
}

const isTool = (name: string): name is ToolName => Object.hasOwn(TOOLS, name)

export async function callTool(caller: Caller, name: string, rawArguments: unknown): Promise<ToolResult> {
  const { ports } = caller
  const started = ports.now()
  if (!isTool(name)) {
    ports.log({ event: 'assistant.call', tool: name, outcome: 'refused', reason: 'unknown_tool', client: caller.clientLabel })
    return { ok: false, error: 'unknown_tool' }
  }
  const definition = TOOLS[name]
  const args = typeof rawArguments === 'object' && rawArguments !== null ? (rawArguments as Readonly<Record<string, unknown>>) : {}
  const parsed = definition.input.safeParse(args)
  const resolved = await resolve(caller, name, args)
  const shopId = subjectShop(resolved)

  let decision: GatewayDecision
  if (resolved.kind === 'unresolved') decision = { ok: false, reason: 'actor' }
  else if (resolved.kind === 'rental' && !resolved.live) decision = { ok: false, reason: 'actor' }
  else {
    const limit = resolved.kind === 'rental' ? RENTAL : PUBLIC
    const withinRate = await takeRateToken(ports.database, limit, resolved.kind === 'rental' ? resolved.subject.sessionId : (caller.network ?? 'local'))
    decision = gatewayDecision({
      actor: resolved.actor,
      tool: { name, tier: definition.tier },
      subjectShopId: resolved.kind === 'rental' ? resolved.subject.shopId : (shopId ?? null),
      subjectRentalId: resolved.kind === 'rental' ? resolved.subject.rentalId : null,
      // No mandate lets an assistant answer a claim in this build: the renter's advocate (section 9) brings the first.
      mandate: null,
      now: started,
      callsInWindow: withinRate ? 0 : limit.max,
      rateLimit: limit.max,
      argumentsValid: parsed.success,
    })
  }

  let result: Handled<Readonly<Record<string, unknown>>>
  let outcome: string
  if (decision.ok && parsed.success) {
    result = await handle(caller, name, parsed.data, resolved)
    outcome = result.ok ? 'ok' : 'refused'
  } else if (!decision.ok && decision.reason === 'mandate' && name === 'submit_claim_reply' && resolved.kind === 'rental') {
    // Without a mandate, the person decides. Nothing is changed.
    result = { ok: true, output: claimNeedsThePerson(caller, resolved.subject) }
    outcome = 'human_confirmation_required'
  } else {
    const reason = decision.ok ? 'arguments' : decision.reason
    result = { ok: false, reason: ['actor', 'shop', 'rental', 'tier'].includes(reason) ? NOT_AUTHORIZED : reason === 'rate' ? 'rate_limited' : reason === 'arguments' ? 'invalid_arguments' : reason }
    outcome = 'refused'
  }

  const reason = result.ok ? undefined : result.reason
  const why = resolved.kind === 'unresolved' ? resolved.reason : !decision.ok ? decision.reason : undefined
  const durationMs = ports.now().getTime() - started.getTime()
  // The line goes to the rental the token is bound to, never to another rental it named.
  const rentalId = resolved.kind === 'rental' ? resolved.boundRentalId : result.ok ? result.rentalId : undefined
  const askedOther = resolved.kind === 'rental' && resolved.subject.rentalId !== resolved.boundRentalId
  const detail = { outcome, ...(reason === undefined ? {} : { reason }), ...(why === undefined ? {} : { gateway: why }), ...(askedOther ? { askedRental: resolved.subject.rentalId.slice(0, 36) } : {}), tier: definition.tier, client: caller.clientLabel, durationMs }
  const sessionId = resolved.kind === 'rental' ? resolved.subject.sessionId : resolved.kind === 'unresolved' ? resolved.sessionId : undefined
  if (shopId === undefined) ports.log({ event: 'assistant.call', tool: name, ...detail })
  else {
    await inShopOf(ports, shopId, async (transaction) => {
      await transaction.insert(auditLog).values({
        shopId,
        actorKind: resolved.kind === 'public' ? 'public_agent' : 'renter_agent',
        actorId: sessionId ?? null,
        action: `assistant.${name}`,
        // A call bound to a rental is about it; a public call is about the shop, or the booking it made.
        subjectKind: rentalId !== undefined && rentalId !== '' ? 'rental' : 'shop',
        subjectId: rentalId !== undefined && rentalId !== '' ? rentalId : shopId,
        detail,
        at: started,
      })
      if (resolved.kind === 'rental' && decision.ok) await touchAgentSession(transaction, resolved.subject.sessionId, started)
    })
  }
  return result.ok ? { ok: true, output: result.output, ...(result.image === undefined ? {} : { image: result.image }) } : { ok: false, error: result.reason }
}
