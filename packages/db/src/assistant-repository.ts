import { ASSISTANT_LIMITS, assistantBookingStatus, ITEM_CATEGORIES, mayBookUnpaid, PENDING_PAYMENT_MINUTES, quoteState } from '@hold/domain'
import type { AssistantBookingStatus, ItemCategory, Period, RentalState } from '@hold/domain'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { bookableTypes, createBooking, priceBooking } from './booking-repository.ts'
import { readJson } from './read-json.ts'
import { agentSessions, auditLog, executions, moneyEvents, quotes, rentals, wearPolicies } from './schema/index.ts'
import type { DraftReply } from './schema/index.ts'
import { outsideShop } from './scope.ts'
import type { Database, Transaction } from './scope.ts'
import type { PayPalMode } from './shop-repository.ts'

// Renting through the renter's own assistant (extensions.md section 8): the shops it can find, the quotes Hold prices
// for it, the bookings made from them, and the session that later holds its agent token. Every amount is read from
// the shop's item types; an assistant only ever names a quote.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MINUTE = 60_000

export type PublicShopRow = { readonly id: string; readonly name: string; readonly slug: string; readonly timeZone: string; readonly currency: string; readonly kinds: readonly ItemCategory[] }

// Read before any shop is chosen, through a function that answers only with shops taking bookings online.
export async function publicShops(database: Database, filter: { readonly place: string | null; readonly kind: ItemCategory | null; readonly paypalMode: PayPalMode }): Promise<readonly PublicShopRow[]> {
  const rows = await outsideShop(database, (transaction) =>
    transaction
      .select({ id: sql<string>`shop.id`, name: sql<string>`shop.name`, slug: sql<string>`shop.slug`, timeZone: sql<string>`shop.time_zone`, currency: sql<string>`shop.currency`, kinds: sql<unknown>`shop.kinds` })
      .from(sql`hold_public_shops(${filter.place}, ${filter.kind}, ${filter.paypalMode}) as shop`),
  )
  return rows.map((row) => ({ ...row, kinds: readJson(z.array(z.enum(ITEM_CATEGORIES)), row.kinds) }))
}

export type QuotedLine = { readonly itemTypeId: string; readonly name: string; readonly count: number; readonly dayRateCents: number; readonly holdCents: number; readonly feeCents: number }

export type SavedQuote = Period & {
  readonly id: string
  readonly currency: string
  readonly feeCents: number
  readonly holdCents: number
  readonly days: number
  readonly lines: readonly QuotedLine[]
  readonly priceListVersion: number
  readonly wearPolicyVersion: number
  readonly expiresAt: Date
}

export type QuoteResult = { readonly ok: true; readonly quote: SavedQuote } | { readonly ok: false; readonly reason: string }

// Prices a period and a count of each item type, checks enough items are free, and keeps the price for a quarter of an
// hour. Nothing is held: only a booking keeps items.
export async function saveQuote(transaction: Transaction, shopId: string, input: Period & { readonly lines: readonly { readonly itemTypeId: string; readonly count: number }[] }, now: Date): Promise<QuoteResult> {
  const priced = await priceBooking(transaction, shopId, input, now)
  if (!priced.ok) return priced
  const { currency, terms, names, priceList, wearPolicyId } = priced.priced
  const free = await bookableTypes(transaction, input, now)
  if (terms.lines.some((line) => (free.find((type) => type.id === line.itemTypeId)?.available ?? 0) < line.count)) return { ok: false, reason: 'not_available' }
  const lines = terms.lines.map((line) => ({ itemTypeId: line.itemTypeId, name: names.get(line.itemTypeId) ?? '', count: line.count, dayRateCents: line.dayRate.cents, holdCents: line.hold.cents, feeCents: line.fee.cents }))
  const expiresAt = new Date(now.getTime() + ASSISTANT_LIMITS.quoteMinutes * MINUTE)
  const [saved] = await transaction
    .insert(quotes)
    .values({
      shopId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      currency,
      feeCents: terms.fee.cents,
      holdCents: terms.hold.cents,
      lines: lines.map(({ itemTypeId, count, dayRateCents, holdCents }) => ({ itemTypeId, count, dayRateCents, holdCents })),
      priceListId: priceList.id,
      wearPolicyId,
      expiresAt,
      createdAt: now,
    })
    .returning({ id: quotes.id })
  if (saved === undefined) throw new Error('The quote was not saved.')
  const [wear] = await transaction.select({ version: wearPolicies.version }).from(wearPolicies).where(eq(wearPolicies.id, wearPolicyId))
  return {
    ok: true,
    quote: { id: saved.id, startsAt: input.startsAt, endsAt: input.endsAt, currency, feeCents: terms.fee.cents, holdCents: terms.hold.cents, days: terms.days, lines, priceListVersion: priceList.version, wearPolicyVersion: wear?.version ?? priceList.version, expiresAt },
  }
}

// The shop a quote belongs to, read before any shop is chosen, so a booking can be made from the quote's ID alone.
export async function quoteShop(database: Database, quoteId: string): Promise<string | undefined> {
  if (!UUID.test(quoteId)) return undefined
  const [row] = await outsideShop(database, (transaction) => transaction.select({ shopId: sql<string | null>`hold_quote_shop(${quoteId}::uuid)` }).from(sql`(select 1) as one`))
  return row?.shopId ?? undefined
}

const lapsedBefore = (now: Date) => new Date(now.getTime() - PENDING_PAYMENT_MINUTES * MINUTE)
const captureBegun = sql`exists (select 1 from ${executions} where ${executions.rentalId} = ${rentals.id} and ${executions.action} = 'fee_capture')`

// Lets go of the shop's unpaid bookings made by assistants whose fifteen minutes are over, unless a capture of an
// approved fee has begun. Their items were already free; now the rentals say so.
export async function expireUnpaidAssistantBookings(transaction: Transaction, now: Date): Promise<number> {
  const expired = await transaction
    .update(rentals)
    .set({ state: 'abandoned' })
    .where(and(eq(rentals.bookedThrough, 'assistant'), eq(rentals.state, 'pending_payment'), sql`${rentals.createdAt} < ${lapsedBefore(now)}`, sql`not ${captureBegun}`))
    .returning({ id: rentals.id })
  return expired.length
}

export type AssistantBookingInput = {
  readonly quoteId: string
  readonly language: string
  readonly clientLabel: string
  // Only fingerprints: the booking secret is returned to the assistant once, and the link's token goes to PayPal.
  readonly bookingSecretFingerprint: string
  readonly link: { readonly fingerprint: string; readonly expiresAt: Date }
}

export type AssistantBookingResult =
  | { readonly ok: true; readonly rentalId: string; readonly sessionId: string }
  | { readonly ok: false; readonly reason: string }

// A booking awaiting payment, made from a quote that is still usable and still priced as the shop prices today.
export async function bookFromQuote(transaction: Transaction, shopId: string, input: AssistantBookingInput, now: Date): Promise<AssistantBookingResult> {
  if (!UUID.test(input.quoteId)) return { ok: false, reason: 'quote_not_found' }
  const [quote] = await transaction.select().from(quotes).where(eq(quotes.id, input.quoteId)).for('update')
  if (quote === undefined) return { ok: false, reason: 'quote_not_found' }
  const state = quoteState(quote, now)
  if (state !== 'usable') return { ok: false, reason: `quote_${state}` }
  const lines = quote.lines.map((line) => ({ itemTypeId: line.itemTypeId, count: line.count }))
  const priced = await priceBooking(transaction, shopId, { startsAt: quote.startsAt, endsAt: quote.endsAt, lines }, now)
  if (!priced.ok) return priced
  const { terms, priceList } = priced.priced
  // The renter agreed to what the quote said. A booking at any other price or under other terms is not that.
  if (priceList.id !== quote.priceListId || terms.fee.cents !== quote.feeCents || terms.hold.cents !== quote.holdCents) return { ok: false, reason: 'prices_changed' }

  // Bookings in one shop take turns from here to the end of their transaction, so two made at once cannot both count
  // the same number of unpaid bookings and both slip under the cap.
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`assistant-unpaid:${shopId}`}))`)
  await expireUnpaidAssistantBookings(transaction, now)
  const [unpaid] = await transaction
    .select({ count: sql<number>`count(*)::int` })
    .from(rentals)
    .where(and(eq(rentals.bookedThrough, 'assistant'), eq(rentals.state, 'pending_payment')))
  if (!mayBookUnpaid({ unpaidInShop: unpaid?.count ?? 0 })) return { ok: false, reason: 'shop_busy' }

  const booked = await createBooking(transaction, shopId, { startsAt: quote.startsAt, endsAt: quote.endsAt, lines, contact: undefined, language: input.language, bookedThrough: 'assistant', link: input.link }, now)
  if (!booked.ok) return { ok: false, reason: booked.reason }
  await transaction.update(quotes).set({ rentalId: booked.rentalId }).where(eq(quotes.id, quote.id))
  const [session] = await transaction
    .insert(agentSessions)
    .values({ shopId, rentalId: booked.rentalId, bookingSecretFingerprint: input.bookingSecretFingerprint, clientLabel: input.clientLabel, createdAt: now })
    .returning({ id: agentSessions.id })
  if (session === undefined) throw new Error('The assistant session was not created.')
  return { ok: true, rentalId: booked.rentalId, sessionId: session.id }
}

// The session a booking secret's fingerprint names, read before any shop is chosen.
export async function sessionByBookingSecret(database: Database, fingerprint: string): Promise<{ readonly sessionId: string; readonly shopId: string; readonly rentalId: string } | undefined> {
  const [row] = await outsideShop(database, (transaction) =>
    transaction.select({ sessionId: sql<string>`session.id`, shopId: sql<string>`session.shop_id`, rentalId: sql<string>`session.rental_id` }).from(sql`hold_agent_booking(${fingerprint}) as session`),
  )
  return row
}

export type AgentSessionRow = {
  readonly id: string
  readonly shopId: string
  readonly rentalId: string
  readonly scopes: readonly string[]
  readonly clientLabel: string
  readonly expiresAt: Date | null
  readonly revokedAt: Date | null
}

// The session an agent token's fingerprint names, read before any shop is chosen. A revoked one is returned too, so
// its refusal can be written to its shop's audit log.
export async function sessionByToken(database: Database, fingerprint: string): Promise<AgentSessionRow | undefined> {
  const [row] = await outsideShop(database, (transaction) =>
    transaction
      .select({
        id: sql<string>`session.id`,
        shopId: sql<string>`session.shop_id`,
        rentalId: sql<string>`session.rental_id`,
        scopes: sql<unknown>`session.scopes`,
        clientLabel: sql<string>`session.client_label`,
        expiresAt: sql<string | null>`session.expires_at`,
        revokedAt: sql<string | null>`session.revoked_at`,
      })
      .from(sql`hold_agent_session(${fingerprint}) as session`),
  )
  if (row === undefined) return undefined
  // Read through a function, so the times arrive as text.
  return { ...row, scopes: readJson(z.array(z.string()), row.scopes), expiresAt: row.expiresAt === null ? null : new Date(row.expiresAt), revokedAt: row.revokedAt === null ? null : new Date(row.revokedAt) }
}

export type BookingProgress = {
  readonly status: AssistantBookingStatus
  readonly tokenIssued: boolean
  readonly rentalId: string
  readonly state: RentalState
  readonly renterId: string | null
  readonly startsAt: Date
  readonly endsAt: Date
  readonly payBy: Date
}

// Where an assistant's booking stands. One past its time to pay, with no capture begun, is let go here.
export async function bookingProgress(transaction: Transaction, sessionId: string, now: Date): Promise<BookingProgress | undefined> {
  const [row] = await transaction
    .select({
      rentalId: rentals.id,
      state: rentals.state,
      renterId: rentals.renterId,
      startsAt: rentals.startsAt,
      endsAt: rentals.endsAt,
      createdAt: rentals.createdAt,
      tokenFingerprint: agentSessions.tokenFingerprint,
      feeCaptured: sql<boolean>`exists (select 1 from ${moneyEvents} where ${moneyEvents.rentalId} = ${rentals.id} and ${moneyEvents.kind} = 'fee_captured')`,
      captureBegun: sql<boolean>`${captureBegun}`,
    })
    .from(agentSessions)
    .innerJoin(rentals, eq(rentals.id, agentSessions.rentalId))
    .where(eq(agentSessions.id, sessionId))
  if (row === undefined) return undefined
  const status = assistantBookingStatus(row, now)
  let { state } = row
  if (status === 'expired' && state === 'pending_payment') {
    await transaction.update(rentals).set({ state: 'abandoned' }).where(and(eq(rentals.id, row.rentalId), eq(rentals.state, 'pending_payment')))
    state = 'abandoned'
  }
  return {
    status,
    tokenIssued: row.tokenFingerprint !== null,
    rentalId: row.rentalId,
    state,
    renterId: row.renterId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    payBy: new Date(row.createdAt.getTime() + PENDING_PAYMENT_MINUTES * MINUTE),
  }
}

export type IssueResult = { readonly ok: true } | { readonly ok: false; readonly reason: 'not_found' | 'not_paid' | 'already_issued' | 'revoked' }

// Gives the session its agent token, once, and only once PayPal's capture of the fee is on record.
export async function issueAgentToken(transaction: Transaction, sessionId: string, token: { readonly fingerprint: string; readonly expiresAt: Date; readonly scopes: readonly string[] }, now: Date): Promise<IssueResult> {
  const [session] = await transaction.select().from(agentSessions).where(eq(agentSessions.id, sessionId)).for('update')
  if (session === undefined) return { ok: false, reason: 'not_found' }
  if (session.revokedAt !== null) return { ok: false, reason: 'revoked' }
  if (session.tokenFingerprint !== null) return { ok: false, reason: 'already_issued' }
  const progress = await bookingProgress(transaction, sessionId, now)
  if (progress?.status !== 'paid') return { ok: false, reason: 'not_paid' }
  await transaction.update(agentSessions).set({ tokenFingerprint: token.fingerprint, scopes: token.scopes, tokenIssuedAt: now, expiresAt: token.expiresAt }).where(eq(agentSessions.id, sessionId))
  return { ok: true }
}

export async function touchAgentSession(transaction: Transaction, sessionId: string, now: Date): Promise<void> {
  await transaction.update(agentSessions).set({ lastUsedAt: now }).where(and(eq(agentSessions.id, sessionId), isNull(agentSessions.revokedAt)))
}

// The renter disconnects their assistant. Its next call is refused. False when there was nothing to disconnect.
export async function revokeAssistant(transaction: Transaction, rentalId: string, now: Date): Promise<boolean> {
  if (!UUID.test(rentalId)) return false
  const revoked = await transaction
    .update(agentSessions)
    .set({ revokedAt: now })
    .where(and(eq(agentSessions.rentalId, rentalId), isNull(agentSessions.revokedAt)))
    .returning({ id: agentSessions.id })
  return revoked.length > 0
}

// A reply the assistant prepared for the person to read. It decides nothing.
export async function saveDraftReply(transaction: Transaction, sessionId: string, draft: DraftReply, now: Date): Promise<void> {
  await transaction.update(agentSessions).set({ draftReply: draft, draftedAt: now }).where(eq(agentSessions.id, sessionId))
}

// Every call an assistant made on a rental, from the audit log: the booking it made before it had a token, and each
// call with its token since.
const ASSISTANT_ACTION = 'assistant.'

export type RentalAssistant = {
  readonly clientLabel: string
  // A token was issued and the renter has not disconnected it.
  readonly connected: boolean
  readonly revokedAt: Date | null
  readonly draftReply: DraftReply | null
  readonly actions: readonly { readonly tool: string; readonly outcome: string; readonly at: Date }[]
}

export async function rentalAssistant(transaction: Transaction, rentalId: string): Promise<RentalAssistant | undefined> {
  if (!UUID.test(rentalId)) return undefined
  const [session] = await transaction.select().from(agentSessions).where(eq(agentSessions.rentalId, rentalId))
  if (session === undefined) return undefined
  const lines = await transaction
    .select({ action: auditLog.action, detail: auditLog.detail, at: auditLog.at })
    .from(auditLog)
    .where(and(eq(auditLog.subjectKind, 'rental'), eq(auditLog.subjectId, rentalId), inArray(auditLog.actorKind, ['renter_agent', 'public_agent']), sql`${auditLog.action} like ${`${ASSISTANT_ACTION}%`}`))
    .orderBy(asc(auditLog.at), asc(auditLog.id))
  return {
    clientLabel: session.clientLabel,
    connected: session.tokenFingerprint !== null && session.revokedAt === null,
    revokedAt: session.revokedAt,
    draftReply: session.draftReply,
    actions: lines.map((line) => ({ tool: line.action.slice(ASSISTANT_ACTION.length), outcome: typeof line.detail['outcome'] === 'string' ? line.detail['outcome'] : 'ok', at: line.at })),
  }
}
