import { addDays, ASSISTANT_LIMITS, money } from '@hold/domain'
import { eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { registerOwner } from './accounts.ts'
import {
  bookFromQuote,
  bookingProgress,
  issueAgentToken,
  publicShops,
  quoteShop,
  rentalAssistant,
  revokeAssistant,
  saveDraftReply,
  saveQuote,
  sessionByBookingSecret,
  sessionByToken,
} from './assistant-repository.ts'
import { bookableTypes } from './booking-repository.ts'
import { beginFeeCapture, confirmFeeCapture, saveFeeOrder } from './fee-repository.ts'
import { addItems, saveItemType } from './item-repository.ts'
import { publishPriceList } from './price-list-repository.ts'
import { agentSessions, auditLog, quotes, rentals } from './schema/index.ts'
import { inShop } from './scope.ts'
import type { Scope, Transaction } from './scope.ts'
import { savePayPalAccount } from './shop-repository.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

const HOUR = 3_600_000
const NOW = new Date('2026-10-30T09:00:00Z')
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR)
const eur = (cents: number) => money(cents, 'EUR')

let database: TestDatabase
let shop: Scope
let other: Scope
let typeId: string
let otherTypeId: string
let secrets = 0

const act = <Result>(scope: Scope, work: (transaction: Transaction) => Promise<Result>) => inShop(database, scope, work)
const anonymous = (scope: Scope): Scope => ({ role: 'hold_app', shopId: scope.shopId })

async function openShop(subject: string, name: string, timeZone: string, items: number): Promise<{ scope: Scope; typeId: string }> {
  const registered = await registerOwner(database, { subject, email: `${subject}@shop.example`, name: 'Ana', language: 'en', shop: { name, timeZone } })
  const scope: Scope = { role: 'hold_app', shopId: registered.shopId, userId: registered.userId }
  await act(scope, (transaction) => publishPriceList(transaction, scope.shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries: [{ description: 'Scratch', category: 'damage', amount: eur(35_00) }], wearPolicy: 'Scuffs are wear.' }, NOW))
  const saved = await act(scope, (transaction) =>
    saveItemType(transaction, scope.shopId, { draft: { name: 'City e-bike', category: 'e_bike', currency: 'EUR', value: eur(2400_00), hold: eur(300_00), dayRate: eur(40_00), accessories: [], views: [{ label: 'Frame', outline: 'whole_side', required: true }] } }, NOW),
  )
  if (!saved.ok) throw new Error(saved.reason)
  await act(scope, (transaction) => addItems(transaction, { itemTypeId: saved.id, count: items, size: '', serial: '' }, NOW))
  return { scope, typeId: saved.id }
}

const quote = (scope: Scope, startsAt = at(24), endsAt = at(96), count = 1, type = typeId, now = NOW) =>
  act(anonymous(scope), (transaction) => saveQuote(transaction, scope.shopId, { startsAt, endsAt, lines: [{ itemTypeId: type, count }] }, now))

const booking = (quoteId: string) => {
  secrets += 1
  return { quoteId, language: 'en', clientLabel: 'Trip planner', bookingSecretFingerprint: `secret-${String(secrets)}`, link: { fingerprint: `link-${String(secrets)}`, expiresAt: at(24 * 60) } }
}

async function quotedBooking(scope: Scope, startsAt: Date, now = NOW) {
  const quoted = await quote(scope, startsAt, new Date(startsAt.getTime() + 24 * HOUR), 1, typeId, now)
  if (!quoted.ok) throw new Error(quoted.reason)
  const input = booking(quoted.quote.id)
  const booked = await act(anonymous(scope), (transaction) => bookFromQuote(transaction, scope.shopId, input, now))
  if (!booked.ok) throw new Error(booked.reason)
  return { ...booked, secret: input.bookingSecretFingerprint }
}

async function payFee(rentalId: string, payerId = 'PAYER-1') {
  await act(shop, (transaction) => saveFeeOrder(transaction, rentalId, `FEE-${rentalId}`))
  const fee = await act(shop, (transaction) => beginFeeCapture(transaction, rentalId, NOW))
  if (!fee.ok) throw new Error(fee.reason)
  const [rental] = await act(shop, (transaction) => transaction.select({ feeCents: rentals.feeCents }).from(rentals).where(eq(rentals.id, rentalId)))
  await act(shop, (transaction) =>
    confirmFeeCapture(transaction, fee.execution.id, { orderId: `FEE-${rentalId}`, captureId: `CAPTURE-${rentalId}`, status: 'completed', amount: eur(rental?.feeCents ?? 0), payer: { payerId, email: 'priya@example.com', name: 'Priya' } }, NOW),
  )
}

beforeAll(async () => {
  database = await createTestDatabase()
  const lisbon = await openShop('lisbon', 'Ribeira Bikes', 'Europe/Lisbon', 8)
  shop = lisbon.scope
  typeId = lisbon.typeId
  await act(shop, (transaction) => savePayPalAccount(transaction, shop.shopId, 'sandbox', 'hold/paypal/shops/lisbon/sandbox'))
  const porto = await openShop('porto', 'Douro Kayaks', 'Europe/Lisbon', 1)
  other = porto.scope
  otherTypeId = porto.typeId
})

describe('the shops an assistant can find', () => {
  it('are those that take bookings online, by place and by kind of item', async () => {
    expect(await publicShops(database, { place: 'Lisbon', kind: null, paypalMode: 'sandbox' })).toEqual([
      { id: shop.shopId, name: 'Ribeira Bikes', slug: 'ribeira-bikes', timeZone: 'Europe/Lisbon', currency: 'EUR', kinds: ['e_bike'] },
    ])
    expect(await publicShops(database, { place: null, kind: 'e_bike', paypalMode: 'sandbox' })).toHaveLength(1)
    expect(await publicShops(database, { place: null, kind: 'water', paypalMode: 'sandbox' })).toEqual([])
    expect(await publicShops(database, { place: null, kind: null, paypalMode: 'live' })).toEqual([])
  })
})

describe('a quote', () => {
  it('is priced by Hold from the shop’s item types, with the versions of its price list and wear policy', async () => {
    const quoted = await quote(shop, at(24), at(96), 2)
    if (!quoted.ok) throw new Error(quoted.reason)
    expect(quoted.quote).toMatchObject({ currency: 'EUR', feeCents: 2 * 3 * 40_00, holdCents: 2 * 300_00, days: 3, priceListVersion: 1, wearPolicyVersion: 1, expiresAt: at(ASSISTANT_LIMITS.quoteMinutes / 60) })
    expect(quoted.quote.lines).toEqual([{ itemTypeId: typeId, name: 'City e-bike', count: 2, dayRateCents: 40_00, holdCents: 300_00, feeCents: 2 * 3 * 40_00 }])
    expect(await quoteShop(database, quoted.quote.id)).toBe(shop.shopId)
  })

  it('is refused for more items than are free, and for another shop’s item type', async () => {
    expect(await quote(shop, at(24), at(48), 9)).toEqual({ ok: false, reason: 'not_available' })
    expect(await quote(shop, at(24), at(48), 1, otherTypeId)).toEqual({ ok: false, reason: 'not_found' })
  })
})

describe('a booking made from a quote', () => {
  it('waits for its fee, holds the quote’s items, and records the assistant that made it', async () => {
    const { rentalId, sessionId, secret } = await quotedBooking(shop, at(500))
    const [rental] = await act(shop, (transaction) => transaction.select().from(rentals).where(eq(rentals.id, rentalId)))
    expect(rental).toMatchObject({ state: 'pending_payment', bookedThrough: 'assistant', feeCents: 40_00, holdCents: 300_00 })
    expect(await sessionByBookingSecret(database, secret)).toEqual({ sessionId, shopId: shop.shopId, rentalId })
    const free = await act(shop, (transaction) => bookableTypes(transaction, { startsAt: at(500), endsAt: at(524) }, NOW))
    expect(free[0]?.available).toBe(7)
  })

  it('is made from a quote once, and never from an expired one', async () => {
    const quoted = await quote(shop, at(600), at(624))
    if (!quoted.ok) throw new Error(quoted.reason)
    expect(await act(anonymous(shop), (transaction) => bookFromQuote(transaction, shop.shopId, booking(quoted.quote.id), NOW))).toMatchObject({ ok: true })
    expect(await act(anonymous(shop), (transaction) => bookFromQuote(transaction, shop.shopId, booking(quoted.quote.id), NOW))).toEqual({ ok: false, reason: 'quote_used' })
    const late = await quote(shop, at(700), at(724))
    if (!late.ok) throw new Error(late.reason)
    expect(await act(anonymous(shop), (transaction) => bookFromQuote(transaction, shop.shopId, booking(late.quote.id), at(1)))).toEqual({ ok: false, reason: 'quote_expired' })
  })

  it('is refused once the shop has changed its prices since the quote', async () => {
    const quoted = await quote(other, at(800), at(824), 1, otherTypeId)
    if (!quoted.ok) throw new Error(quoted.reason)
    await act(other, (transaction) => publishPriceList(transaction, other.shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries: [{ description: 'Scratch', category: 'damage', amount: eur(45_00) }], wearPolicy: 'Scuffs are wear.' }, NOW))
    expect(await act(anonymous(other), (transaction) => bookFromQuote(transaction, other.shopId, booking(quoted.quote.id), NOW))).toEqual({ ok: false, reason: 'prices_changed' })
  })
})

describe('an unpaid booking', () => {
  it('expires after fifteen minutes: the rental is let go and its item is free again', async () => {
    const { sessionId, rentalId } = await quotedBooking(shop, at(3000))
    expect(await act(anonymous(shop), (transaction) => bookingProgress(transaction, sessionId, at(0.2)))).toMatchObject({ status: 'awaiting_payment' })
    const later = new Date(NOW.getTime() + 16 * 60_000)
    expect(await act(anonymous(shop), (transaction) => bookingProgress(transaction, sessionId, later))).toMatchObject({ status: 'expired' })
    const [rental] = await act(shop, (transaction) => transaction.select({ state: rentals.state }).from(rentals).where(eq(rentals.id, rentalId)))
    expect(rental?.state).toBe('abandoned')
    const free = await act(shop, (transaction) => bookableTypes(transaction, { startsAt: at(3000), endsAt: at(3024) }, later))
    expect(free[0]?.available).toBe(8)
  })
})

describe('the agent token', () => {
  it('is issued once, and only after PayPal’s capture of the fee is on record', async () => {
    const { sessionId, rentalId } = await quotedBooking(shop, at(4000))
    const token = { fingerprint: 'token-a', expiresAt: addDays(at(4024), 14), scopes: ['rental', 'claim'] }
    expect(await act(anonymous(shop), (transaction) => issueAgentToken(transaction, sessionId, token, NOW))).toEqual({ ok: false, reason: 'not_paid' })
    await payFee(rentalId)
    expect(await act(anonymous(shop), (transaction) => bookingProgress(transaction, sessionId, at(1)))).toMatchObject({ status: 'paid', tokenIssued: false })
    expect(await act(anonymous(shop), (transaction) => issueAgentToken(transaction, sessionId, token, NOW))).toEqual({ ok: true })
    expect(await act(anonymous(shop), (transaction) => issueAgentToken(transaction, sessionId, { ...token, fingerprint: 'token-b' }, NOW))).toEqual({ ok: false, reason: 'already_issued' })
    expect(await sessionByToken(database, 'token-a')).toMatchObject({ id: sessionId, shopId: shop.shopId, rentalId, scopes: ['rental', 'claim'], clientLabel: 'Trip planner', revokedAt: null })
    expect(await sessionByToken(database, 'token-b')).toBeUndefined()
  })

  it('is revoked by the renter, after which the session takes no draft and no new token', async () => {
    const { sessionId, rentalId } = await quotedBooking(shop, at(5000))
    await payFee(rentalId, 'PAYER-2')
    await act(anonymous(shop), (transaction) => issueAgentToken(transaction, sessionId, { fingerprint: 'token-c', expiresAt: at(9000), scopes: ['claim'] }, NOW))
    await act(anonymous(shop), (transaction) => saveDraftReply(transaction, sessionId, { decision: 'contest', comment: 'The scratch was there before.' }, NOW))
    expect(await act(anonymous(shop), (transaction) => revokeAssistant(transaction, rentalId, at(1)))).toBe(true)
    expect((await sessionByToken(database, 'token-c'))?.revokedAt).toEqual(at(1))
    expect(await act(anonymous(shop), (transaction) => revokeAssistant(transaction, rentalId, at(2)))).toBe(false)
    await expect(act(anonymous(shop), (transaction) => saveDraftReply(transaction, sessionId, { decision: 'accept', comment: '' }, at(3)))).rejects.toThrow()
    await expect(act(anonymous(shop), (transaction) => transaction.update(agentSessions).set({ revokedAt: null }).where(eq(agentSessions.id, sessionId)))).rejects.toThrow()
  })
})

describe('what the renter sees of their assistant', () => {
  it('is its declared name, whether it is connected, its draft, and every call it made on the rental', async () => {
    const { sessionId, rentalId } = await quotedBooking(shop, at(6000))
    await act(anonymous(shop), (transaction) =>
      transaction.insert(auditLog).values([
        { shopId: shop.shopId, actorKind: 'public_agent', action: 'assistant.create_booking', subjectKind: 'rental', subjectId: rentalId, detail: { outcome: 'ok' }, at: at(0.1) },
        { shopId: shop.shopId, actorKind: 'renter_agent', actorId: sessionId, action: 'assistant.get_hold', subjectKind: 'rental', subjectId: rentalId, detail: { outcome: 'ok' }, at: at(0.2) },
        { shopId: shop.shopId, actorKind: 'staff', action: 'rental.link_shown', subjectKind: 'rental', subjectId: rentalId, at: at(0.3) },
      ]),
    )
    await act(anonymous(shop), (transaction) => saveDraftReply(transaction, sessionId, { decision: 'contest', comment: 'Not mine.' }, at(0.4)))
    expect(await act(anonymous(shop), (transaction) => rentalAssistant(transaction, rentalId))).toEqual({
      clientLabel: 'Trip planner',
      connected: false,
      revokedAt: null,
      draftReply: { decision: 'contest', comment: 'Not mine.' },
      actions: [
        { tool: 'create_booking', outcome: 'ok', at: at(0.1) },
        { tool: 'get_hold', outcome: 'ok', at: at(0.2) },
      ],
    })
  })
})

describe('the cap on unpaid bookings', () => {
  it('is refused once the shop holds as many unpaid bookings from assistants as it may', async () => {
    const later = at(2)
    const unpaid = await act(shop, (transaction) => transaction.select({ count: sql<number>`count(*)::int` }).from(rentals).where(sql`${rentals.bookedThrough} = 'assistant' and ${rentals.state} = 'pending_payment' and ${rentals.createdAt} > ${new Date(later.getTime() - 15 * 60_000)}`))
    for (let index = unpaid[0]?.count ?? 0; index < ASSISTANT_LIMITS.unpaidPerShop; index += 1) await quotedBooking(shop, at(1000 + index * 48), later)
    const quoted = await quote(shop, at(2000), at(2024), 1, typeId, later)
    if (!quoted.ok) throw new Error(quoted.reason)
    expect(await act(anonymous(shop), (transaction) => bookFromQuote(transaction, shop.shopId, booking(quoted.quote.id), later))).toEqual({ ok: false, reason: 'shop_busy' })
  })

  it('serializes the shop’s bookings before counting, so bookings made at once cannot both slip under the cap', async () => {
    // The lock is held for the rest of the booking's transaction: a second booking in the shop waits for it to end.
    const quoted = await quote(other, at(3000), at(3024), 1, otherTypeId)
    if (!quoted.ok) throw new Error(quoted.reason)
    const locks = await act(anonymous(other), async (transaction) => {
      await bookFromQuote(transaction, other.shopId, booking(quoted.quote.id), NOW)
      return transaction.select({ objid: sql<number>`objid` }).from(sql`pg_locks`).where(sql`locktype = 'advisory' and pid = pg_backend_pid() and granted`)
    })
    expect(locks).toHaveLength(1)
  })

  it('lets only the allowed number land when bookings arrive together', async () => {
    const third = await openShop('braga', 'Braga Bikes', 'Europe/Lisbon', 10)
    const quoted = await Promise.all(Array.from({ length: ASSISTANT_LIMITS.unpaidPerShop + 3 }, (_, index) => quote(third.scope, at(100 + index * 48), at(124 + index * 48), 1, third.typeId)))
    const results = await Promise.all(
      quoted.map((each) => {
        if (!each.ok) throw new Error(each.reason)
        return act(anonymous(third.scope), (transaction) => bookFromQuote(transaction, third.scope.shopId, booking(each.quote.id), NOW))
      }),
    )
    expect(results.filter((result) => result.ok)).toHaveLength(ASSISTANT_LIMITS.unpaidPerShop)
    expect(results.filter((result) => !result.ok && result.reason === 'shop_busy')).toHaveLength(3)
  })
})

describe('row-level security', () => {
  it('shows a second shop none of the first shop’s quotes or sessions', async () => {
    const seen = await act(other, async (transaction) => ({
      quotes: await transaction.select().from(quotes).where(eq(quotes.shopId, shop.shopId)),
      sessions: await transaction.select().from(agentSessions).where(eq(agentSessions.shopId, shop.shopId)),
    }))
    expect(seen).toEqual({ quotes: [], sessions: [] })
  })
})
