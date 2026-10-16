import { addDays, money } from '@hold/domain'
import type { ItemTypeDraft } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { registerOwner } from './accounts.ts'
import { createBooking, rentalDetail } from './booking-repository.ts'
import { beginFeeCapture, confirmFeeCapture, failExecution, saveFeeOrder } from './fee-repository.ts'
import { askForHold, beginHoldPlacement, confirmHoldPlaced, holdRentalByOrder, rentalHold, saveHoldOrder } from './hold-repository.ts'
import { confirmAuthorizationReleased, expireHold, holdUpkeep, saveReplacementOrder, shopOwners, upkeepTarget } from './hold-upkeep-repository.ts'
import { addItems, saveItemType } from './item-repository.ts'
import { publishPriceList } from './price-list-repository.ts'
import { authorizations, executions, holds, moneyEvents, outbox } from './schema/index.ts'
import { inShop } from './scope.ts'
import type { Scope, Transaction } from './scope.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

const HOUR = 60 * 60 * 1000
const NOW = new Date('2026-10-16T09:00:00Z')
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR)
const eur = (cents: number) => money(cents, 'EUR')
const HOLD = 300_00

let database: TestDatabase
let shop: Scope
let other: Scope
let typeId: string
let slot = 0

const act = <Result>(scope: Scope, work: (transaction: Transaction) => Promise<Result>) => inShop(database, scope, work)

const type: ItemTypeDraft = {
  name: 'City e-bike',
  category: 'e_bike',
  currency: 'EUR',
  value: eur(2400_00),
  hold: eur(HOLD),
  dayRate: eur(40_00),
  accessories: [],
  views: [{ label: 'Frame', outline: 'whole_side', required: true }],
}

// A rental whose fee PayPal captured: booked, and waiting for its renter at the counter.
async function booked(): Promise<string> {
  slot += 1
  const created = await act(shop, (transaction) =>
    createBooking(
      transaction,
      shop.shopId,
      { lines: [{ itemTypeId: typeId, count: 1 }], startsAt: at(slot * 50), endsAt: at(slot * 50 + 24), contact: undefined, language: 'en', bookedThrough: 'staff', link: { fingerprint: `hold-fingerprint-${String(slot)}`, expiresAt: at(2000) } },
      NOW,
    ),
  )
  if (!created.ok) throw new Error(created.reason)
  const { rentalId } = created
  await act(shop, (transaction) => saveFeeOrder(transaction, rentalId, `FEE-ORDER-${rentalId}`))
  const begun = await act(shop, (transaction) => beginFeeCapture(transaction, rentalId, NOW))
  if (!begun.ok) throw new Error(begun.reason)
  const payer = { payerId: `PAYER-${rentalId}`, email: 'priya@example.com', name: 'Priya Natarajan' }
  await act(shop, (transaction) => confirmFeeCapture(transaction, begun.execution.id, { orderId: `FEE-ORDER-${rentalId}`, captureId: `FEE-CAPTURE-${rentalId}`, status: 'completed', amount: eur(40_00), payer }, NOW))
  return rentalId
}

// A booked rental whose renter is approving the hold in PayPal, with the authorization recorded.
async function approving(): Promise<{ rentalId: string; executionId: string; orderId: string }> {
  const rentalId = await booked()
  await act(shop, (transaction) => askForHold(transaction, rentalId, NOW))
  const orderId = `HOLD-ORDER-${rentalId}`
  await act(shop, (transaction) => saveHoldOrder(transaction, rentalId, orderId))
  const begun = await act(shop, (transaction) => beginHoldPlacement(transaction, rentalId, NOW))
  if (!begun.ok) throw new Error(begun.reason)
  return { rentalId, executionId: begun.execution.id, orderId }
}

const authorization = (rentalId: string, overrides: Partial<{ status: 'created' | 'pending'; cents: number }> = {}) => ({
  authorizationId: `AUTH-${rentalId}`,
  status: overrides.status ?? 'created',
  amount: eur(overrides.cents ?? HOLD),
  createdAt: at(1),
  expiresAt: addDays(at(1), 29),
})

const stateOf = async (rentalId: string) => (await act(shop, (transaction) => rentalDetail(transaction, rentalId, NOW)))?.state

beforeAll(async () => {
  database = await createTestDatabase()
  const registered = await registerOwner(database, { subject: 'owner', email: 'ana@ribeira.example', name: 'Ana', language: 'en', shop: { name: 'Ribeira Bikes', timeZone: 'Europe/Lisbon' } })
  shop = { role: 'hold_app', shopId: registered.shopId, userId: registered.userId }
  const second = await registerOwner(database, { subject: 'other', email: 'kim@douro.example', name: 'Kim', language: 'en', shop: { name: 'Douro Boats', timeZone: 'UTC' } })
  other = { role: 'hold_app', shopId: second.shopId, userId: second.userId }
  await act(shop, (transaction) =>
    publishPriceList(transaction, shop.shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries: [{ description: 'Scratch', category: 'damage', amount: eur(35_00) }], wearPolicy: 'Scuffs are wear.' }, NOW),
  )
  const saved = await act(shop, (transaction) => saveItemType(transaction, shop.shopId, { draft: type }, NOW))
  if (!saved.ok) throw new Error(saved.reason)
  typeId = saved.id
  await act(shop, (transaction) => addItems(transaction, { itemTypeId: typeId, count: 1, size: '', serial: '' }, NOW))
})

describe('asking for the hold at pickup', () => {
  it('requests the hold the renter agreed to at booking, and the rental waits for it', async () => {
    const rentalId = await booked()
    const asked = await act(shop, (transaction) => askForHold(transaction, rentalId, NOW))
    expect(asked).toMatchObject({ ok: true })
    expect(await stateOf(rentalId)).toBe('awaiting_hold')
    expect(await act(shop, (transaction) => rentalHold(transaction, rentalId))).toMatchObject({ state: 'requested', reservedCents: HOLD, currency: 'EUR', strategy: 'at_counter', orderId: null })
  })

  it('gives the same hold when asked again', async () => {
    const rentalId = await booked()
    const first = await act(shop, (transaction) => askForHold(transaction, rentalId, NOW))
    const again = await act(shop, (transaction) => askForHold(transaction, rentalId, NOW))
    expect(again).toEqual(first)
    expect(await database.select().from(holds).where(eq(holds.rentalId, rentalId))).toHaveLength(1)
  })

  it('is refused before the fee is paid', async () => {
    slot += 1
    const created = await act(shop, (transaction) =>
      createBooking(transaction, shop.shopId, { lines: [{ itemTypeId: typeId, count: 1 }], startsAt: at(slot * 50), endsAt: at(slot * 50 + 24), contact: undefined, language: 'en', bookedThrough: 'staff', link: { fingerprint: 'unpaid-hold', expiresAt: at(2000) } }, NOW),
    )
    if (!created.ok) throw new Error(created.reason)
    expect(await act(shop, (transaction) => askForHold(transaction, created.rentalId, NOW))).toEqual({ ok: false, reason: 'not_booked' })
  })

  it('finds nothing in another shop', async () => {
    const rentalId = await booked()
    expect(await act(other, (transaction) => askForHold(transaction, rentalId, NOW))).toEqual({ ok: false, reason: 'not_found' })
  })
})

describe('authorizing the hold the renter approved', () => {
  it('writes one execution and one outbox message, however often it is asked', async () => {
    const { rentalId, executionId, orderId } = await approving()
    const again = await act(shop, (transaction) => beginHoldPlacement(transaction, rentalId, NOW))
    expect(again).toMatchObject({ ok: true, execution: { id: executionId, orderId } })
    const rows = await database.select().from(executions).where(eq(executions.rentalId, rentalId))
    expect(rows.filter((row) => row.action === 'authorize')).toMatchObject([{ amountCents: HOLD, currency: 'EUR' }])
    expect((await database.select().from(outbox)).filter((row) => row.messageGroup === rentalId && row.payload['executionId'] === executionId)).toHaveLength(1)
  })

  it('is refused while the renter has no order to approve', async () => {
    const rentalId = await booked()
    await act(shop, (transaction) => askForHold(transaction, rentalId, NOW))
    expect(await act(shop, (transaction) => beginHoldPlacement(transaction, rentalId, NOW))).toEqual({ ok: false, reason: 'no_order' })
  })

  it('finds the rental from the hold’s order, for PayPal’s events', async () => {
    const { rentalId, orderId } = await approving()
    expect(await act(shop, (transaction) => holdRentalByOrder(transaction, orderId))).toBe(rentalId)
    expect(await act(shop, (transaction) => holdRentalByOrder(transaction, `FEE-ORDER-${rentalId}`))).toBeUndefined()
  })
})

describe('confirming the hold PayPal placed', () => {
  it('records both clocks, logs the money once, and makes the rental ready for handover', async () => {
    const { rentalId, executionId } = await approving()
    const confirm = () => act(shop, (transaction) => confirmHoldPlaced(transaction, executionId, authorization(rentalId), NOW))
    const placed = await confirm()
    expect(placed).toMatchObject({ ok: true, upkeep: { startReplacementAt: addDays(at(1), 26), expiresAt: addDays(at(1), 29) } })
    expect(await confirm()).toMatchObject({ ok: true })
    expect(await stateOf(rentalId)).toBe('ready')
    expect(await act(shop, (transaction) => rentalHold(transaction, rentalId))).toMatchObject({ state: 'placed', assuredUntil: addDays(at(1), 3), validUntil: addDays(at(1), 29), paypalAuthorizationId: `AUTH-${rentalId}` })
    expect(await database.select().from(authorizations).where(eq(authorizations.paypalAuthorizationId, `AUTH-${rentalId}`))).toHaveLength(1)
    expect(await database.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId))).toMatchObject([{ kind: 'fee_captured' }, { kind: 'hold_placed', amountCents: HOLD, paypalReference: `AUTH-${rentalId}` }])
    expect((await database.select().from(executions).where(eq(executions.id, executionId)))[0]?.state).toBe('confirmed')
  })

  it('gives the upkeep of a placed hold again, so its schedules can be made after a failure', async () => {
    const { rentalId, executionId } = await approving()
    const holdId = (await act(shop, (transaction) => rentalHold(transaction, rentalId)))?.id ?? ''
    expect(await act(shop, (transaction) => holdUpkeep(transaction, holdId))).toBeUndefined()
    const placed = await act(shop, (transaction) => confirmHoldPlaced(transaction, executionId, authorization(rentalId), NOW))
    if (!placed.ok) throw new Error(placed.reason)
    expect(await act(shop, (transaction) => holdUpkeep(transaction, holdId))).toEqual(placed.upkeep)
  })

  it('refuses an authorization for another amount, and the rental keeps waiting', async () => {
    const { rentalId, executionId } = await approving()
    expect(await act(shop, (transaction) => confirmHoldPlaced(transaction, executionId, authorization(rentalId, { cents: HOLD + 1 }), NOW))).toEqual({ ok: false, reason: 'amount_mismatch' })
    expect(await stateOf(rentalId)).toBe('awaiting_hold')
    expect((await act(shop, (transaction) => rentalHold(transaction, rentalId)))?.state).toBe('requested')
    expect((await database.select().from(executions).where(eq(executions.id, executionId)))[0]?.state).toBe('failed')
  })

  it('waits while PayPal is still reviewing the authorization', async () => {
    const { rentalId, executionId } = await approving()
    expect(await act(shop, (transaction) => confirmHoldPlaced(transaction, executionId, authorization(rentalId, { status: 'pending' }), NOW))).toEqual({ ok: false, reason: 'pending' })
    expect(await stateOf(rentalId)).toBe('awaiting_hold')
    expect((await database.select().from(executions).where(eq(executions.id, executionId)))[0]?.state).toBe('submitted')
  })

  it('lets the renter try another way after a decline, with a fresh order and a fresh key', async () => {
    const { rentalId, executionId } = await approving()
    expect((await act(shop, (transaction) => rentalHold(transaction, rentalId)))?.placementFailure).toBeNull()
    await act(shop, (transaction) => failExecution(transaction, executionId, 'declined', NOW))
    expect((await act(shop, (transaction) => rentalHold(transaction, rentalId)))?.placementFailure).toBe('declined')
    await act(shop, (transaction) => saveHoldOrder(transaction, rentalId, `HOLD-ORDER-${rentalId}-2`))
    expect((await act(shop, (transaction) => rentalHold(transaction, rentalId)))?.placementFailure).toBeNull()
    const retried = await act(shop, (transaction) => beginHoldPlacement(transaction, rentalId, NOW))
    expect(retried).toMatchObject({ ok: true, execution: { orderId: `HOLD-ORDER-${rentalId}-2` } })
    if (!retried.ok) throw new Error(retried.reason)
    expect(retried.execution.id).not.toBe(executionId)
    expect(await stateOf(rentalId)).toBe('awaiting_hold')
  })
})

describe('a hold reaching the end of its life', () => {
  async function placedHold() {
    const { rentalId, executionId } = await approving()
    const placed = await act(shop, (transaction) => confirmHoldPlaced(transaction, executionId, authorization(rentalId), NOW))
    if (!placed.ok) throw new Error(placed.reason)
    return { rentalId, ...placed.upkeep }
  }
  const worker = () => ({ role: 'hold_worker', shopId: shop.shopId }) as const

  it('names what an upkeep step acts on: the hold, the authorization PayPal knows it by, and whether it is still the current one', async () => {
    const { rentalId, holdId, authorizationId } = await placedHold()
    expect(await act(worker(), (transaction) => upkeepTarget(transaction, holdId, authorizationId))).toMatchObject({
      rentalId,
      holdState: 'placed',
      rentalState: 'ready',
      current: true,
      paypalAuthorizationId: `AUTH-${rentalId}`,
      validUntil: addDays(at(1), 29),
      reservedCents: HOLD,
      currency: 'EUR',
    })
  })

  it('marks the hold expired once, while it still rests on that authorization', async () => {
    const { rentalId, holdId, authorizationId } = await placedHold()
    expect(await act(worker(), (transaction) => expireHold(transaction, holdId, authorizationId, addDays(at(1), 29)))).toEqual({ ok: true, rentalId })
    expect(await act(worker(), (transaction) => expireHold(transaction, holdId, authorizationId, addDays(at(1), 29)))).toEqual({ ok: false, reason: 'not_placed' })
    expect((await act(shop, (transaction) => rentalHold(transaction, rentalId)))?.state).toBe('expired')
    expect((await database.select().from(authorizations).where(eq(authorizations.id, authorizationId)))[0]?.state).toBe('expired')
  })

  it('leaves a hold alone when the authorization is not the one it rests on', async () => {
    const { holdId } = await placedHold()
    const { authorizationId: another } = await placedHold()
    expect(await act(worker(), (transaction) => expireHold(transaction, holdId, another, NOW))).toEqual({ ok: false, reason: 'not_current' })
  })

  it('finds the shop’s owners to tell, in their own language', async () => {
    expect(await act(worker(), shopOwners)).toEqual([{ email: 'ana@ribeira.example', name: 'Ana', language: 'en' }])
  })
})

describe('replacing a hold before it ends', () => {
  async function placedHold() {
    const { rentalId, executionId } = await approving()
    const placed = await act(shop, (transaction) => confirmHoldPlaced(transaction, executionId, authorization(rentalId), NOW))
    if (!placed.ok) throw new Error(placed.reason)
    return { rentalId, ...placed.upkeep }
  }
  const replacement = (rentalId: string) => ({ ...authorization(rentalId), authorizationId: `AUTH-${rentalId}-2`, createdAt: addDays(at(1), 26), expiresAt: addDays(at(1), 55) })

  // A placed hold whose renter approved a replacement, with the authorization of it recorded.
  async function replacing() {
    const placed = await placedHold()
    expect(await act(shop, (transaction) => saveReplacementOrder(transaction, placed.holdId, placed.authorizationId, `REPLACEMENT-${placed.rentalId}`))).toEqual({ ok: true })
    const begun = await act(shop, (transaction) => beginHoldPlacement(transaction, placed.rentalId, NOW))
    if (!begun.ok) throw new Error(begun.reason)
    return { ...placed, executionId: begun.execution.id, orderId: begun.execution.orderId }
  }

  it('keeps the order the renter is asked to approve, as the order the hold waits on, and finds the rental by it', async () => {
    const { rentalId, orderId } = await replacing()
    expect(orderId).toBe(`REPLACEMENT-${rentalId}`)
    expect(await act(shop, (transaction) => rentalHold(transaction, rentalId))).toMatchObject({ state: 'placed', orderId: `REPLACEMENT-${rentalId}` })
    expect(await act(shop, (transaction) => holdRentalByOrder(transaction, `REPLACEMENT-${rentalId}`))).toBe(rentalId)
  })

  it('is asked for only on the authorization the hold rests on', async () => {
    const first = await placedHold()
    const second = await placedHold()
    expect(await act(shop, (transaction) => saveReplacementOrder(transaction, first.holdId, second.authorizationId, 'REPLACEMENT-X'))).toEqual({ ok: false, reason: 'not_current' })
  })

  it('moves the hold onto the new authorization, logs it, and records the release of the old one as an execution', async () => {
    const { rentalId, executionId, authorizationId: old } = await replacing()
    const placed = await act(shop, (transaction) => confirmHoldPlaced(transaction, executionId, replacement(rentalId), NOW))
    if (!placed.ok) throw new Error(placed.reason)
    expect(placed.upkeep).toMatchObject({ startReplacementAt: addDays(at(1), 52), expiresAt: addDays(at(1), 55) })
    expect(placed.replaced?.authorizationId).toBe(old)
    expect(await act(shop, (transaction) => rentalHold(transaction, rentalId))).toMatchObject({ state: 'placed', orderId: null, paypalAuthorizationId: `AUTH-${rentalId}-2` })
    const [added] = await database.select().from(authorizations).where(eq(authorizations.paypalAuthorizationId, `AUTH-${rentalId}-2`))
    expect(added?.replacesId).toBe(old)
    const [release] = await database.select().from(executions).where(eq(executions.id, placed.replaced?.releaseExecutionId ?? ''))
    expect(release).toMatchObject({ action: 'release', state: 'pending', paypalResourceIds: { authorization: `AUTH-${rentalId}` } })
    const lines = await database.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId))
    expect(lines.filter((line) => line.kind === 'hold_placed').map((line) => line.paypalReference)).toEqual([`AUTH-${rentalId}`, `AUTH-${rentalId}-2`])
    expect(await act(shop, (transaction) => confirmHoldPlaced(transaction, executionId, replacement(rentalId), NOW))).toMatchObject({ ok: true, replaced: undefined })
  })

  it('records the old authorization released once PayPal voided it, and logs the money released once', async () => {
    const { rentalId, executionId, authorizationId: old } = await replacing()
    const placed = await act(shop, (transaction) => confirmHoldPlaced(transaction, executionId, replacement(rentalId), NOW))
    if (!placed.ok || placed.replaced === undefined) throw new Error('No release.')
    const releaseId = placed.replaced.releaseExecutionId
    expect(await act(shop, (transaction) => confirmAuthorizationReleased(transaction, releaseId, { status: 'voided' }, NOW))).toEqual({ ok: true })
    expect(await act(shop, (transaction) => confirmAuthorizationReleased(transaction, releaseId, { status: 'voided' }, NOW))).toEqual({ ok: true })
    expect((await database.select().from(authorizations).where(eq(authorizations.id, old)))[0]?.state).toBe('voided')
    const released = (await database.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId))).filter((line) => line.kind === 'hold_released')
    expect(released).toMatchObject([{ amountCents: HOLD, paypalReference: `AUTH-${rentalId}:voided` }])
    expect((await act(shop, (transaction) => rentalHold(transaction, rentalId)))?.state).toBe('placed')
  })

  it('refuses to record a release PayPal does not show as voided', async () => {
    const { rentalId, executionId } = await replacing()
    const placed = await act(shop, (transaction) => confirmHoldPlaced(transaction, executionId, replacement(rentalId), NOW))
    if (!placed.ok || placed.replaced === undefined) throw new Error('No release.')
    const releaseId = placed.replaced.releaseExecutionId
    expect(await act(shop, (transaction) => confirmAuthorizationReleased(transaction, releaseId, { status: 'created' }, NOW))).toEqual({ ok: false, reason: 'not_voided' })
  })
})

