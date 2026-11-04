import { money } from '@hold/domain'
import type { ItemTypeDraft } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { registerOwner } from './accounts.ts'
import { abandonBooking, bookableTypes, createBooking, issueRenterLink, rentalDetail, rentalList } from './booking-repository.ts'
import { beginFeeCapture, confirmFeeCapture, saveFeeOrder } from './fee-repository.ts'
import { rentalHold } from './hold-repository.ts'
import { shopSnapshot } from './ops-repository.ts'
import { addItems, changeStatus, itemCatalog, saveItemType } from './item-repository.ts'
import { publishPriceList } from './price-list-repository.ts'
import { findRenterLink, renterContact, renterView } from './renter-repository.ts'
import { executions, moneyEvents, outbox, rentals } from './schema/index.ts'
import { inShop } from './scope.ts'
import type { Scope, Transaction } from './scope.ts'
import { shopBySlug } from './shop-repository.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

const HOUR = 60 * 60 * 1000
const NOW = new Date('2026-10-15T09:00:00Z')
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR)
const eur = (cents: number) => money(cents, 'EUR')

let database: TestDatabase
let owner: Scope
let shopId: string
let other: Scope
let ebikeTypeId: string
let seatTypeId: string
let fingerprints = 0

const act = <Result>(scope: Scope, work: (transaction: Transaction) => Promise<Result>) => inShop(database, scope, work)
const link = () => ({ fingerprint: `fingerprint-${String((fingerprints += 1))}`, expiresAt: at(24 * 60) })

const type = (name: string, dayRate: number, hold: number): ItemTypeDraft => ({
  name,
  category: 'e_bike',
  currency: 'EUR',
  value: eur(2400_00),
  hold: eur(hold),
  dayRate: eur(dayRate),
  accessories: [],
  views: [{ label: 'Frame', outline: 'whole_side', required: true }],
})

async function newType(draft: ItemTypeDraft, items: number): Promise<string> {
  const saved = await act(owner, (transaction) => saveItemType(transaction, shopId, { draft }, NOW))
  if (!saved.ok) throw new Error(saved.reason)
  await act(owner, (transaction) => addItems(transaction, { itemTypeId: saved.id, count: items, size: '', serial: '' }, NOW))
  return saved.id
}

const booking = (lines: readonly { itemTypeId: string; count: number }[], startsAt = at(24), endsAt = at(96)) => ({
  lines,
  startsAt,
  endsAt,
  contact: { name: 'Priya Natarajan', email: 'priya@example.com' },
  language: 'en',
  bookedThrough: 'staff' as const,
  link: link(),
})

async function book(lines: readonly { itemTypeId: string; count: number }[], startsAt?: Date, endsAt?: Date) {
  const created = await act(owner, (transaction) => createBooking(transaction, shopId, booking(lines, startsAt, endsAt), NOW))
  if (!created.ok) throw new Error(created.reason)
  return created.rentalId
}

beforeAll(async () => {
  database = await createTestDatabase()
  const registered = await registerOwner(database, { subject: 'owner', email: 'ana@ribeira.example', name: 'Ana', language: 'en', shop: { name: 'Ribeira Bikes', timeZone: 'Europe/Lisbon' } })
  shopId = registered.shopId
  owner = { role: 'hold_app', shopId, userId: registered.userId }
  const second = await registerOwner(database, { subject: 'other', email: 'kim@douro.example', name: 'Kim', language: 'en', shop: { name: 'Ribeira Bikes', timeZone: 'UTC' } })
  other = { role: 'hold_app', shopId: second.shopId, userId: second.userId }
  await act(owner, (transaction) =>
    publishPriceList(transaction, shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries: [{ description: 'Scratch', category: 'damage', amount: eur(35_00) }], wearPolicy: 'Scuffs are wear.' }, NOW),
  )
  ebikeTypeId = await newType(type('City e-bike', 40_00, 300_00), 3)
  seatTypeId = await newType(type('Child seat', 8_00, 50_00), 1)
})

describe('a shop’s address', () => {
  it('is made from its name, and numbered when another shop has it', async () => {
    expect(await shopBySlug(database, 'ribeira-bikes')).toMatchObject({ id: shopId, name: 'Ribeira Bikes', currency: 'EUR', timeZone: 'Europe/Lisbon' })
    expect(await shopBySlug(database, 'ribeira-bikes-2')).toMatchObject({ id: other.shopId })
    expect(await shopBySlug(database, 'no-such-shop')).toBeUndefined()
  })
})

describe('what can be booked', () => {
  it('counts the items of each type free for the period, and leaves samples out', async () => {
    const types = await act(owner, (transaction) => bookableTypes(transaction, { startsAt: at(500), endsAt: at(520) }, NOW))
    expect(types.map((each) => [each.name, each.available, each.dayRateCents, each.holdCents])).toEqual([
      ['Child seat', 1, 8_00, 50_00],
      ['City e-bike', 3, 40_00, 300_00],
    ])
  })
})

// architecture.md section 8.2: a walk-in staff let approve the fee and the hold once. The hold is asked for at booking.
describe('a walk-in booking', () => {
  let lockTypeId: string
  beforeAll(async () => { lockTypeId = await newType(type('Spare lock', 3_00, 20_00), 2) })

  it('asks for a combined hold at booking when staff choose it for a rental that starts today', async () => {
    const created = await act(owner, (transaction) => createBooking(transaction, shopId, { ...booking([{ itemTypeId: lockTypeId, count: 1 }], at(1), at(5)), placement: 'combined' }, NOW))
    if (!created.ok) throw new Error(created.reason)
    expect(await act(owner, (transaction) => rentalDetail(transaction, created.rentalId, NOW))).toMatchObject({ state: 'pending_payment', feeCents: 3_00, holdCents: 20_00 })
    expect(await act(owner, (transaction) => rentalHold(transaction, created.rentalId))).toMatchObject({ state: 'requested', strategy: 'combined', reservedCents: 20_00, ordinaryCents: 20_00, currency: 'EUR' })
    // The renter's page then asks for the fee and the hold in one approval.
    expect((await act(owner, (transaction) => renterView(transaction, created.rentalId, NOW)))?.walkIn).toBe(true)
  })

  it('asks for no hold at booking for a rental on another day, whatever staff chose', async () => {
    const created = await act(owner, (transaction) => createBooking(transaction, shopId, { ...booking([{ itemTypeId: lockTypeId, count: 1 }], at(30), at(40)), placement: 'combined' }, NOW))
    if (!created.ok) throw new Error(created.reason)
    expect(await act(owner, (transaction) => rentalHold(transaction, created.rentalId))).toBeUndefined()
    expect((await act(owner, (transaction) => renterView(transaction, created.rentalId, NOW)))?.walkIn).toBe(false)
  })
})

describe('a booking', () => {
  it('waits for its fee, priced from the day rates and holding each item’s hold', async () => {
    const rentalId = await book([
      { itemTypeId: ebikeTypeId, count: 2 },
      { itemTypeId: seatTypeId, count: 1 },
    ])
    const detail = await act(owner, (transaction) => rentalDetail(transaction, rentalId, NOW))
    expect(detail).toMatchObject({ state: 'pending_payment', feeCents: 3 * (2 * 40_00 + 8_00), holdCents: 2 * 300_00 + 50_00, contactName: 'Priya Natarajan', bookedThrough: 'staff' })
    expect(detail?.items.map((item) => item.label)).toEqual(['Child seat 1', 'City e-bike 1', 'City e-bike 2'])
  })

  it('reaches by text a renter booked with a phone, until they confirm it or choose email on their own page', async () => {
    const created = await act(owner, (transaction) => createBooking(transaction, shopId, { ...booking([{ itemTypeId: seatTypeId, count: 1 }], at(900), at(920)), contact: { name: 'Priya Natarajan', email: '', phone: '+41791234567' } }, NOW))
    if (!created.ok) throw new Error(created.reason)
    expect(await act(owner, (transaction) => renterContact(transaction, created.rentalId))).toMatchObject({ channel: 'text', phone: '+41791234567', phoneConfirmed: false, email: null })
    // Staff see how the renter is reached, and only enough of the number to recognise it.
    expect(await act(owner, (transaction) => rentalDetail(transaction, created.rentalId, NOW))).toMatchObject({ contactChannel: 'text', contactPhone: '+41 ••• •• 67' })
  })

  it('takes the items no overlapping rental keeps, and refuses when there are not enough', async () => {
    const second = await book([{ itemTypeId: ebikeTypeId, count: 1 }])
    expect((await act(owner, (transaction) => rentalDetail(transaction, second, NOW)))?.items.map((item) => item.label)).toEqual(['City e-bike 3'])
    const refused = await act(owner, (transaction) => createBooking(transaction, shopId, booking([{ itemTypeId: ebikeTypeId, count: 1 }]), NOW))
    expect(refused).toEqual({ ok: false, reason: 'not_available', itemTypeId: ebikeTypeId })
    const later = await book([{ itemTypeId: ebikeTypeId, count: 3 }], at(200), at(220))
    expect(later).toBeDefined()
  })

  it('does not take an item in repair', async () => {
    const typeId = await newType(type('Cargo bike', 50_00, 400_00), 1)
    const [item] = (await act(owner, (transaction) => bookableTypes(transaction, { startsAt: at(24), endsAt: at(48) }, NOW))).filter((each) => each.id === typeId)
    expect(item?.available).toBe(1)
    const cargo = (await act(owner, itemCatalog)).items.find((each) => each.itemTypeId === typeId)
    await act(owner, (transaction) => changeStatus(transaction, cargo?.id ?? '', { to: 'in_repair', note: 'Chain' }, NOW))
    expect(await act(owner, (transaction) => createBooking(transaction, shopId, booking([{ itemTypeId: typeId, count: 1 }]), NOW))).toEqual({ ok: false, reason: 'not_available', itemTypeId: typeId })
  })

  it('names the first problem with its period', async () => {
    const refused = await act(owner, (transaction) => createBooking(transaction, shopId, booking([{ itemTypeId: seatTypeId, count: 1 }], at(30), at(29)), NOW))
    expect(refused).toEqual({ ok: false, reason: 'period_reversed' })
  })

  it('cannot use another shop’s item type', async () => {
    const refused = await act(other, (transaction) => createBooking(transaction, other.shopId, booking([{ itemTypeId: ebikeTypeId, count: 1 }]), NOW))
    expect(refused).toEqual({ ok: false, reason: 'not_found' })
  })

  it('is listed with what was booked and for whom', async () => {
    const list = await act(owner, (transaction) => rentalList(transaction, NOW))
    expect(list.length).toBeGreaterThan(0)
    expect(list[0]).toMatchObject({ who: 'Priya Natarajan', state: 'pending_payment', paymentLapsed: false })
  })
})

describe('a renter link', () => {
  it('names its rental and its scopes, read before any shop is chosen', async () => {
    const rentalId = await book([{ itemTypeId: seatTypeId, count: 1 }], at(300), at(310))
    const issued = { fingerprint: 'renter-link-a', expiresAt: at(24 * 30) }
    await act(owner, (transaction) => issueRenterLink(transaction, shopId, rentalId, issued, ['view', 'pay']))
    expect(await findRenterLink(database, 'renter-link-a')).toMatchObject({ shopId, rentalId, scopes: ['view', 'pay'], revokedAt: null })
    expect(await findRenterLink(database, 'unknown')).toBeUndefined()
  })

  it('shows the renter the terms they agree to: the fee, the hold and the published prices', async () => {
    const rentalId = await book([{ itemTypeId: seatTypeId, count: 1 }], at(320), at(330))
    const view = await act({ role: 'hold_app', shopId }, (transaction) => renterView(transaction, rentalId, NOW))
    expect(view).toMatchObject({ shopName: 'Ribeira Bikes', state: 'pending_payment', feeCents: 8_00, holdCents: 50_00, currency: 'EUR', days: 1, wearPolicy: 'Scuffs are wear.' })
    expect(view?.lines).toEqual([{ name: 'Child seat', count: 1, dayRateCents: 8_00, holdCents: 50_00 }])
    expect(view?.prices).toEqual([{ description: 'Scratch', category: 'damage', amountCents: 35_00 }])
  })

  it('tells the renter until when an unpaid booking keeps its items: fifteen minutes from when it was made', async () => {
    const rentalId = await book([{ itemTypeId: seatTypeId, count: 1 }], at(340), at(350))
    const view = await act({ role: 'hold_app', shopId }, (transaction) => renterView(transaction, rentalId, NOW))
    expect(view?.paymentKeptUntil).toEqual(new Date(NOW.getTime() + 15 * 60_000))
    const lapsed = await act({ role: 'hold_app', shopId }, (transaction) => renterView(transaction, rentalId, new Date(NOW.getTime() + 16 * 60_000)))
    expect(lapsed).toMatchObject({ paymentLapsed: true, paymentKeptUntil: null })
  })
})

describe('paying the fee', () => {
  let slot = 0
  async function pending() {
    slot += 1
    const rentalId = await book([{ itemTypeId: seatTypeId, count: 1 }], at(400 + slot * 30), at(424 + slot * 30))
    await act({ role: 'hold_app', shopId }, (transaction) => saveFeeOrder(transaction, rentalId, `ORDER-${rentalId}`))
    return rentalId
  }
  const payment = (rentalId: string, cents = 8_00) => ({
    orderId: `ORDER-${rentalId}`,
    captureId: `CAPTURE-${rentalId}`,
    status: 'completed' as const,
    amount: eur(cents),
    payer: { payerId: `PAYER-${rentalId}`, email: 'priya@example.com', name: 'Priya Natarajan' },
  })

  it('writes one execution and one outbox message, however often it is asked', async () => {
    const rentalId = await pending()
    const first = await act({ role: 'hold_app', shopId }, (transaction) => beginFeeCapture(transaction, rentalId, NOW))
    const again = await act({ role: 'hold_app', shopId }, (transaction) => beginFeeCapture(transaction, rentalId, NOW))
    if (!first.ok || !again.ok) throw new Error('No execution.')
    expect(again.execution).toEqual(first.execution)
    expect(first.execution).toMatchObject({ orderId: `ORDER-${rentalId}`, idempotencyKey: `fee-capture-${rentalId}-ORDER-${rentalId}` })
    expect(await database.select().from(executions).where(eq(executions.rentalId, rentalId))).toHaveLength(1)
    expect((await database.select().from(outbox)).filter((row) => row.messageGroup === rentalId)).toHaveLength(1)
  })

  it('books the rental once PayPal names who paid, and logs the money once', async () => {
    const rentalId = await pending()
    const begun = await act({ role: 'hold_app', shopId }, (transaction) => beginFeeCapture(transaction, rentalId, NOW))
    if (!begun.ok) throw new Error(begun.reason)
    const confirm = () => act({ role: 'hold_app', shopId }, (transaction) => confirmFeeCapture(transaction, begun.execution.id, payment(rentalId), NOW))
    expect(await confirm()).toEqual({ ok: true })
    expect(await confirm()).toEqual({ ok: true })
    const detail = await act(owner, (transaction) => rentalDetail(transaction, rentalId, NOW))
    expect(detail).toMatchObject({ state: 'booked', renterName: 'Priya Natarajan' })
    expect(await database.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId))).toMatchObject([{ kind: 'fee_captured', amountCents: 8_00 }])
    expect(await database.select({ state: executions.state }).from(executions).where(eq(executions.rentalId, rentalId))).toEqual([{ state: 'confirmed' }])
  })

  it('keeps the name the rental was booked under once a PayPal account with another name pays', async () => {
    const rentalId = await pending()
    const begun = await act({ role: 'hold_app', shopId }, (transaction) => beginFeeCapture(transaction, rentalId, NOW))
    if (!begun.ok) throw new Error(begun.reason)
    const paidByAna = { ...payment(rentalId), payer: { payerId: `PAYER-ANA-${rentalId}`, email: 'ana@example.com', name: 'Ana Doe' } }
    expect(await act({ role: 'hold_app', shopId }, (transaction) => confirmFeeCapture(transaction, begun.execution.id, paidByAna, NOW))).toEqual({ ok: true })
    const listed = (await act(owner, (transaction) => rentalList(transaction, NOW))).find((each) => each.id === rentalId)
    expect(listed?.who).toBe('Priya Natarajan')
    expect(await act(owner, (transaction) => rentalDetail(transaction, rentalId, NOW))).toMatchObject({ who: 'Priya Natarajan', renterName: 'Ana Doe' })
  })

  it('refuses a payment for another amount, and leaves the rental waiting', async () => {
    const rentalId = await pending()
    const begun = await act({ role: 'hold_app', shopId }, (transaction) => beginFeeCapture(transaction, rentalId, NOW))
    if (!begun.ok) throw new Error(begun.reason)
    const confirmed = await act({ role: 'hold_app', shopId }, (transaction) => confirmFeeCapture(transaction, begun.execution.id, payment(rentalId, 1_00), NOW))
    expect(confirmed).toEqual({ ok: false, reason: 'amount_mismatch' })
    expect((await database.select({ state: rentals.state }).from(rentals).where(eq(rentals.id, rentalId)))[0]?.state).toBe('pending_payment')
  })

  it('records what PayPal captured for another amount in the money log, once, and shows the difference to a person', async () => {
    const rentalId = await pending()
    const begun = await act({ role: 'hold_app', shopId }, (transaction) => beginFeeCapture(transaction, rentalId, NOW))
    if (!begun.ok) throw new Error(begun.reason)
    const confirm = () => act({ role: 'hold_app', shopId }, (transaction) => confirmFeeCapture(transaction, begun.execution.id, payment(rentalId, 1_00), NOW))
    expect(await confirm()).toEqual({ ok: false, reason: 'amount_mismatch' })
    expect(await confirm()).toEqual({ ok: false, reason: 'amount_mismatch' })

    expect(await database.select({ kind: moneyEvents.kind, amountCents: moneyEvents.amountCents, paypalReference: moneyEvents.paypalReference }).from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId))).toEqual([{ kind: 'fee_captured', amountCents: 1_00, paypalReference: `CAPTURE-${rentalId}` }])
    expect((await database.select().from(executions).where(eq(executions.id, begun.execution.id)))[0]).toMatchObject({ state: 'failed', lastError: 'amount_mismatch', paypalResourceIds: { capture: `CAPTURE-${rentalId}` } })
    const snapshot = await act({ role: 'hold_worker', shopId }, (transaction) => shopSnapshot(transaction, NOW, { disputes: [], differences: [] }))
    expect(snapshot.differences).toContainEqual({ id: `CAPTURE-${rentalId}:fee_amount`, subjectKind: 'fee_capture', subjectId: `CAPTURE-${rentalId}`, rentalId })
    expect(snapshot.differences.filter((difference) => difference.rentalId === rentalId)).toHaveLength(1)
  })

  it('goes ahead after the time to pay lapsed, while nobody else has taken the items', async () => {
    const rentalId = await pending()
    expect(await act({ role: 'hold_app', shopId }, (transaction) => beginFeeCapture(transaction, rentalId, at(1)))).toMatchObject({ ok: true })
  })

  it('is refused once the time to pay lapsed and another booking took the items', async () => {
    const rentalId = await pending()
    const detail = await act(owner, (transaction) => rentalDetail(transaction, rentalId, NOW))
    if (detail === undefined) throw new Error('No rental.')
    // Booked an hour later, when the first booking no longer kept the seat.
    const taken = await act(owner, (transaction) => createBooking(transaction, shopId, booking([{ itemTypeId: seatTypeId, count: 1 }], detail.startsAt, detail.endsAt), at(1)))
    expect(taken).toMatchObject({ ok: true })
    const late = await act({ role: 'hold_app', shopId }, (transaction) => beginFeeCapture(transaction, rentalId, at(1)))
    expect(late).toEqual({ ok: false, reason: 'payment_lapsed' })
  })
})

describe('cancelling a booking', () => {
  it('lets go of an unpaid booking and its items, and nothing else', async () => {
    // Far after every slot the fee tests book, so another test's rental never shares its period.
    const rentalId = await book([{ itemTypeId: seatTypeId, count: 1 }], at(5000), at(5010))
    expect(await act(owner, (transaction) => abandonBooking(transaction, rentalId))).toEqual({ ok: true })
    expect(await act(owner, (transaction) => abandonBooking(transaction, rentalId))).toEqual({ ok: false, reason: 'transition_not_allowed' })
    expect((await act(owner, (transaction) => bookableTypes(transaction, { startsAt: at(5000), endsAt: at(5010) }, NOW))).find((each) => each.id === seatTypeId)?.available).toBe(1)
  })
})
