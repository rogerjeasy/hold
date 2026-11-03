import { addDays, money } from '@hold/domain'
import { asc, eq } from 'drizzle-orm'
import { registerOwner } from '../accounts.ts'
import { createBooking } from '../booking-repository.ts'
import { beginFeeCapture, confirmFeeCapture, saveFeeOrder } from '../fee-repository.ts'
import { askForHold, beginHoldPlacement, confirmHoldPlaced, saveHoldOrder } from '../hold-repository.ts'
import { addItems, saveItemType } from '../item-repository.ts'
import { publishPriceList } from '../price-list-repository.ts'
import { rentalItems, rentals } from '../schema/index.ts'
import { inShop } from '../scope.ts'
import type { Database, Scope, Transaction } from '../scope.ts'

// A shop with an e-bike type of two required views and one optional one, and rentals of its items that are ready for
// handover: the fee paid and the hold placed. For the repository tests.

const eur = (cents: number) => money(cents, 'EUR')
export const VIEWS = ['left-side', 'right-side', 'battery'] as const

export type ReadyRentalShop = {
  readonly scope: Scope
  readonly typeId: string
  act<Result>(work: (transaction: Transaction) => Promise<Result>): Promise<Result>
  // A rental of the given items, or the next free one, ready for handover, on days of its own.
  readyRental(itemCount?: number): Promise<{ readonly rentalId: string; readonly rentalItemIds: readonly string[]; readonly itemIds: readonly string[] }>
  // A rental of one item whose fee the given PayPal payer paid: booked, and waiting for its hold.
  paidRental(payerId: string): Promise<string>
  // The same, moved straight to closed, for tests of what may happen once a rental has ended.
  endedRental(payerId: string): Promise<string>
}

export async function readyRentalShop(database: Database, subject: string, now: Date): Promise<ReadyRentalShop> {
  const registered = await registerOwner(database, { subject, email: `${subject}@shop.example`, name: 'Ana', language: 'en', shop: { name: `Shop ${subject}`, timeZone: 'UTC' } })
  const scope: Scope = { role: 'hold_app', shopId: registered.shopId, userId: registered.userId }
  const act = <Result>(work: (transaction: Transaction) => Promise<Result>) => inShop(database, scope, work)
  await act((transaction) =>
    publishPriceList(transaction, scope.shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries: [{ description: 'Scratch', category: 'damage', amount: eur(35_00) }], wearPolicy: 'Scuffs are wear.' }, now),
  )
  const views = [
    { label: 'Left side', outline: 'whole_side', required: true },
    { label: 'Right side', outline: 'whole_side', required: true },
    { label: 'Battery', outline: 'detail', required: false },
  ] as const
  const saved = await act((transaction) =>
    saveItemType(transaction, scope.shopId, { draft: { name: 'City e-bike', category: 'e_bike', currency: 'EUR', value: eur(2400_00), hold: eur(300_00), dayRate: eur(40_00), accessories: [], views: [...views] } }, now),
  )
  if (!saved.ok) throw new Error(saved.reason)
  const typeId = saved.id
  await act((transaction) => addItems(transaction, { itemTypeId: typeId, count: 2, size: '', serial: '' }, now))
  let slot = 0

  // Booked on days of its own, so the shop's items never run out, and its fee paid by the payer.
  async function paid(itemCount: number, payerId: (rentalId: string) => string): Promise<string> {
    slot += 1
    const startsAt = new Date(now.getTime() + slot * 72 * 3_600_000)
    const created = await act((transaction) =>
      createBooking(
        transaction,
        scope.shopId,
        { lines: [{ itemTypeId: typeId, count: itemCount }], startsAt, endsAt: new Date(startsAt.getTime() + 24 * 3_600_000), contact: { name: 'Priya', email: 'priya@example.com' }, language: 'en', bookedThrough: 'staff', link: { fingerprint: `${subject}-link-${String(slot)}`, expiresAt: addDays(now, 300) } },
        now,
      ),
    )
    if (!created.ok) throw new Error(created.reason)
    const { rentalId } = created
    await act((transaction) => saveFeeOrder(transaction, rentalId, `FEE-${rentalId}`))
    const fee = await act((transaction) => beginFeeCapture(transaction, rentalId, now))
    if (!fee.ok) throw new Error(fee.reason)
    const payer = { payerId: payerId(rentalId), email: 'priya@example.com', name: 'Priya Natarajan' }
    await act((transaction) => confirmFeeCapture(transaction, fee.execution.id, { orderId: `FEE-${rentalId}`, captureId: `CAPTURE-${rentalId}`, status: 'completed', amount: eur(itemCount * 40_00), payer }, now))
    return rentalId
  }

  return {
    scope,
    typeId,
    act,
    paidRental: (payerId) => paid(1, () => payerId),
    async endedRental(payerId) {
      const rentalId = await paid(1, () => payerId)
      await act((transaction) => transaction.update(rentals).set({ state: 'closed' }).where(eq(rentals.id, rentalId)))
      return rentalId
    },
    async readyRental(itemCount = 1) {
      const rentalId = await paid(itemCount, (id) => `PAYER-${id}`)
      await act((transaction) => askForHold(transaction, rentalId, now))
      await act((transaction) => saveHoldOrder(transaction, rentalId, `HOLD-${rentalId}`))
      const hold = await act((transaction) => beginHoldPlacement(transaction, rentalId, now))
      if (!hold.ok) throw new Error(hold.reason)
      const placed = await act((transaction) =>
        confirmHoldPlaced(transaction, hold.execution.id, { authorizationId: `AUTH-${rentalId}`, status: 'created', amount: eur(itemCount * 300_00), createdAt: now, expiresAt: addDays(now, 29) }, now),
      )
      if (!placed.ok) throw new Error(placed.reason)
      const rentalItemRows = await act((transaction) => transaction.select({ id: rentalItems.id, itemId: rentalItems.itemId }).from(rentalItems).where(eq(rentalItems.rentalId, rentalId)).orderBy(asc(rentalItems.id)))
      return { rentalId, rentalItemIds: rentalItemRows.map((row) => row.id), itemIds: rentalItemRows.map((row) => row.itemId) }
    },
  }
}
