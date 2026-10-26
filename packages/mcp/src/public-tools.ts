import { AGENT_SCOPES, agentTokenExpiry, ASSISTANT_LIMITS, atShopTime, bookingTerms, money, PENDING_PAYMENT_MINUTES, rentalDays } from '@hold/domain'
import { bookableTypes, bookFromQuote, bookingProgress, currentPriceList, issueAgentToken, publicShops, quotes, saveQuote, shops, takeRateToken } from '@hold/db'
import { eq } from 'drizzle-orm'
import { HOLD_TERMS, LANGUAGES } from './catalogue.ts'
import type { ToolInput, ToolOutput } from './catalogue.ts'
import { inShopOf } from './ports.ts'
import type { McpPorts } from './ports.ts'
import { issueSecret } from './secrets.ts'

// The tools open to any assistant (extensions.md section 8.3). Every amount is read from the shop's records.

export type Caller = { readonly ports: McpPorts; readonly network: string | undefined; readonly clientLabel: string }
export type ShopSubject = { readonly shopId: string; readonly slug: string; readonly timeZone: string; readonly currency: string }

export type Handled<Output> = { readonly ok: true; readonly output: Output; readonly rentalId?: string; readonly image?: string } | { readonly ok: false; readonly reason: string }

const ok = <Output>(output: Output, extra: { readonly rentalId?: string; readonly image?: string } = {}): Handled<Output> => ({ ok: true, output, ...extra })
const refused = (reason: string): Handled<never> => ({ ok: false, reason })
const words = (text: string) => ({ merchant_words: text })
const amountOf = (cents: number, currency: string) => ({ cents, currency })

// Bookings one caller may make in the time an unpaid booking keeps its items.
const BOOKINGS = { name: 'assistant-booking', max: ASSISTANT_LIMITS.bookingsPerCaller, windowSeconds: PENDING_PAYMENT_MINUTES * 60 } as const

function period(shop: ShopSubject, startsAt: string, endsAt: string) {
  const from = atShopTime(shop.timeZone, startsAt)
  const to = atShopTime(shop.timeZone, endsAt)
  return from === undefined || to === undefined || to.getTime() <= from.getTime() ? undefined : { startsAt: from, endsAt: to }
}

export async function findShops(caller: Caller, input: ToolInput<'find_shops'>): Promise<Handled<ToolOutput<'find_shops'>>> {
  const found = await publicShops(caller.ports.database, { place: input.place ?? null, kind: input.kind ?? null, paypalMode: caller.ports.paypalMode })
  return ok({ shops: found.map((shop) => ({ shop: shop.slug, name: words(shop.name), time_zone: shop.timeZone, currency: shop.currency, kinds: [...shop.kinds] })) })
}

export async function getShop(caller: Caller, shop: ShopSubject): Promise<Handled<ToolOutput<'get_shop'>>> {
  const [row] = await inShopOf(caller.ports, shop.shopId, (transaction) => transaction.select({ name: shops.name, replyPeriodHours: shops.replyPeriodHours }).from(shops).where(eq(shops.id, shop.shopId)))
  if (row === undefined) return refused('shop_not_found')
  return ok({ shop: shop.slug, name: words(row.name), time_zone: shop.timeZone, currency: shop.currency, languages: [...LANGUAGES], claim_reply_hours: row.replyPeriodHours, hold_terms: HOLD_TERMS })
}

export async function checkAvailability(caller: Caller, shop: ShopSubject, input: ToolInput<'check_availability'>): Promise<Handled<ToolOutput<'check_availability'>>> {
  const asked = period(shop, input.starts_at, input.ends_at)
  if (asked === undefined) return refused('period_invalid')
  const days = rentalDays(asked.startsAt, asked.endsAt)
  const types = await inShopOf(caller.ports, shop.shopId, (transaction) => bookableTypes(transaction, asked, caller.ports.now()))
  return ok({
    shop: shop.slug,
    starts_at: asked.startsAt.toISOString(),
    ends_at: asked.endsAt.toISOString(),
    days,
    item_types: types.map((type) => ({
      item_type_id: type.id,
      name: words(type.name),
      kind: type.category,
      available: type.available,
      day_rate: amountOf(type.dayRateCents, type.currency),
      fee_for_period: amountOf(bookingTerms([{ itemTypeId: type.id, count: 1, dayRate: money(type.dayRateCents, type.currency), hold: money(type.holdCents, type.currency) }], days, type.currency).fee.cents, type.currency),
      hold_each: amountOf(type.holdCents, type.currency),
    })),
  })
}

export async function getDamagePrices(caller: Caller, shop: ShopSubject): Promise<Handled<ToolOutput<'get_damage_prices'>>> {
  const list = await inShopOf(caller.ports, shop.shopId, (transaction) => currentPriceList(transaction))
  if (list === undefined) return refused('no_price_list')
  return ok({
    shop: shop.slug,
    // The price list and the wear policy are published together, under one version.
    price_list_version: list.version,
    wear_policy_version: list.version,
    prices: list.entries.map((entry) => ({ code: entry.code, category: entry.category, description: words(entry.description), amount: amountOf(entry.amountCents, list.currency) })),
    wear_policy: words(list.wearPolicy),
    hold_terms: HOLD_TERMS,
  })
}

export async function quoteRental(caller: Caller, shop: ShopSubject, input: ToolInput<'quote_rental'>): Promise<Handled<ToolOutput<'quote_rental'>>> {
  const asked = period(shop, input.starts_at, input.ends_at)
  if (asked === undefined) return refused('period_invalid')
  const lines = input.items.map((item) => ({ itemTypeId: item.item_type_id, count: item.count }))
  const saved = await inShopOf(caller.ports, shop.shopId, (transaction) => saveQuote(transaction, shop.shopId, { ...asked, lines }, caller.ports.now()))
  if (!saved.ok) return refused(saved.reason)
  const { quote } = saved
  return ok({
    quote_id: quote.id,
    shop: shop.slug,
    starts_at: quote.startsAt.toISOString(),
    ends_at: quote.endsAt.toISOString(),
    days: quote.days,
    fee: amountOf(quote.feeCents, quote.currency),
    hold: amountOf(quote.holdCents, quote.currency),
    lines: quote.lines.map((line) => ({ item_type_id: line.itemTypeId, name: words(line.name), count: line.count, day_rate: amountOf(line.dayRateCents, quote.currency), hold_each: amountOf(line.holdCents, quote.currency), fee: amountOf(line.feeCents, quote.currency) })),
    price_list_version: quote.priceListVersion,
    wear_policy_version: quote.wearPolicyVersion,
    expires_at: quote.expiresAt.toISOString(),
  })
}

// A booking from a quote, then the fee's PayPal order. The order is made after the booking is written, never inside its
// transaction. If PayPal cannot be reached the booking simply lapses after fifteen minutes.
export async function createBooking(caller: Caller, shopId: string, input: ToolInput<'create_booking'>): Promise<Handled<ToolOutput<'create_booking'>>> {
  const { ports } = caller
  if (!(await takeRateToken(ports.database, BOOKINGS, caller.network ?? 'local'))) return refused('caller_busy')
  const secret = issueSecret(ports.secret, 'booking_secret', ports.random)
  const language = input.language ?? 'en'
  const now = ports.now()
  const booked = await inShopOf(ports, shopId, async (transaction) => {
    const [quote] = await transaction.select({ endsAt: quotes.endsAt, startsAt: quotes.startsAt, feeCents: quotes.feeCents, holdCents: quotes.holdCents, currency: quotes.currency }).from(quotes).where(eq(quotes.id, input.quote_id))
    if (quote === undefined) return { ok: false, reason: 'quote_not_found' } as const
    const link = await ports.newRenterLink(quote.endsAt)
    const made = await bookFromQuote(transaction, shopId, { quoteId: input.quote_id, language, clientLabel: caller.clientLabel, bookingSecretFingerprint: secret.fingerprint, link }, now)
    return made.ok ? ({ ...made, quote, linkToken: link.token } as const) : made
  })
  if (!booked.ok) return refused(booked.reason)
  const payment = await ports.startFeePayment({ shopId, rentalId: booked.rentalId, renterLinkToken: booked.linkToken, language })
  if (!payment.ok) return { ok: false, reason: payment.reason }
  const { quote } = booked
  return ok(
    {
      status: 'awaiting_payment',
      booking_secret: secret.secret,
      approval_url: payment.approvalUrl,
      pay_by: new Date(now.getTime() + PENDING_PAYMENT_MINUTES * 60_000).toISOString(),
      fee: amountOf(quote.feeCents, quote.currency),
      hold: amountOf(quote.holdCents, quote.currency),
      starts_at: quote.startsAt.toISOString(),
      ends_at: quote.endsAt.toISOString(),
    },
    { rentalId: booked.rentalId, image: await ports.qrCode(payment.approvalUrl) },
  )
}

// Whether the fee is paid. The first call after PayPal's capture is on record receives the agent token, once.
export async function getBooking(caller: Caller, session: { readonly sessionId: string; readonly shopId: string }): Promise<Handled<ToolOutput<'get_booking'>>> {
  const { ports } = caller
  const now = ports.now()
  const token = issueSecret(ports.secret, 'agent_token', ports.random)
  const result = await inShopOf(ports, session.shopId, async (transaction) => {
    const progress = await bookingProgress(transaction, session.sessionId, now)
    if (progress === undefined) return undefined
    if (progress.status !== 'paid') return { progress, token: 'none', expiresAt: null } as const
    if (progress.tokenIssued) return { progress, token: 'issued_earlier', expiresAt: null } as const
    const expiresAt = agentTokenExpiry(progress.endsAt)
    const issued = await issueAgentToken(transaction, session.sessionId, { fingerprint: token.fingerprint, expiresAt, scopes: AGENT_SCOPES }, now)
    return issued.ok ? ({ progress, token: 'issued_now', expiresAt } as const) : ({ progress, token: 'issued_earlier', expiresAt: null } as const)
  })
  if (result === undefined) return refused('not_found')
  const { progress } = result
  const paid = progress.status === 'paid'
  return ok(
    {
      status: progress.status,
      pay_by: progress.status === 'awaiting_payment' ? progress.payBy.toISOString() : null,
      rental_id: paid ? progress.rentalId : null,
      token: paid ? result.token : progress.status === 'awaiting_payment' ? 'not_yet' : 'none',
      agent_token: result.token === 'issued_now' ? token.secret : null,
      token_expires_at: result.expiresAt === null ? null : result.expiresAt.toISOString(),
      scopes: result.token === 'issued_now' ? [...AGENT_SCOPES] : [],
    },
    { rentalId: progress.rentalId },
  )
}
