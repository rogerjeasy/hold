import { addItems, askForHold, createBooking, findPayPalAccount, inShop, paypalEvents, publishPriceList, recordPayPalEvent, registerOwner, saveFeeOrder, saveHoldOrder, saveItemType, savePayPalAccount, saveWebhookId } from '@hold/db'
import type { Transaction } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import type { TestDatabase } from '@hold/db/testing'
import { money } from '@hold/domain'
import { createFakePayPal, FAKE_SIGNATURE } from '@hold/paypal'
import type { FakePayPal } from '@hold/paypal'
import { eq } from 'drizzle-orm'
import type { SettleDependencies } from '../dependencies.ts'
import { runExecution } from '../executions.ts'
import { requestFeeCapture } from '../fee-capture.ts'

// One shop with a connected PayPal account, an e-bike type and its item, for the settle tests. Each booking takes days
// of its own, so bookings never compete for the item.

export const eur = (cents: number) => money(cents, 'EUR')
export const FEE = 40_00
export const HOLD = 300_00

export type SettleFixture = {
  readonly database: TestDatabase
  readonly fake: FakePayPal
  readonly shopId: string
  inShop<Result>(work: (transaction: Transaction) => Promise<Result>): Promise<Result>
  // A booking waiting for its fee, with a fee order in PayPal for it.
  waitingRental(approved: boolean): Promise<{ readonly rentalId: string; readonly orderId: string }>
  // An event as PayPal would deliver it to the shop's address, stored first as the intake stores it.
  delivered(type: string, resource: Readonly<Record<string, unknown>>, signature?: string): Promise<string>
  // A rental whose fee is paid and whose hold staff asked for at pickup, with the renter's order for it in PayPal,
  // approved unless told otherwise.
  approvedHold(dependencies: SettleDependencies, options?: { readonly approve?: boolean }): Promise<{ readonly rentalId: string; readonly orderId: string }>
  // A walk-in staff booked at the counter for now, who approved the fee and the hold in one order in PayPal.
  approvedWalkIn(): Promise<{ readonly rentalId: string; readonly orderId: string }>
}

export async function createSettleFixture(now: () => Date = () => new Date()): Promise<SettleFixture> {
  const database = await createTestDatabase()
  const fake = createFakePayPal({ now })
  const registered = await registerOwner(database, { subject: 'owner', email: 'ana@ribeira.example', name: 'Ana', language: 'en', shop: { name: 'Ribeira Bikes', timeZone: 'UTC' } })
  const { shopId } = registered
  const owner = { role: 'hold_app', shopId, userId: registered.userId } as const
  const webhook = await fake.createWebhook({ url: 'https://hold.test/api/webhooks/paypal/a', eventTypes: [] })
  const webhookId = webhook.ok ? webhook.value.webhookId : ''
  const typeId = await inShop(database, owner, async (transaction) => {
    await publishPriceList(transaction, shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries: [{ description: 'Scratch', category: 'damage', amount: eur(35_00) }], wearPolicy: 'Wear.' }, now())
    await savePayPalAccount(transaction, shopId, 'sandbox', 'hold/paypal/shops/a/sandbox')
    await saveWebhookId(transaction, shopId, 'sandbox', webhookId)
    const saved = await saveItemType(transaction, shopId, { draft: { name: 'E-bike', category: 'e_bike', currency: 'EUR', value: eur(2400_00), hold: eur(HOLD), dayRate: eur(FEE), accessories: [], views: [{ label: 'Frame', outline: 'whole_side', required: true }] } }, now())
    if (!saved.ok) throw new Error(saved.reason)
    await addItems(transaction, { itemTypeId: saved.id, count: 1, size: '', serial: '' }, now())
    return saved.id
  })
  const accountId = (await inShop(database, owner, (transaction) => findPayPalAccount(transaction, shopId, 'sandbox')))?.id ?? ''
  // Walk-ins rent from a type of their own, so a walk-in starting now never meets an advance booking's item.
  const walkInTypeId = await inShop(database, owner, async (transaction) => {
    const saved = await saveItemType(transaction, shopId, { draft: { name: 'Walk-in bike', category: 'bike', currency: 'EUR', value: eur(900_00), hold: eur(HOLD), dayRate: eur(FEE), accessories: [], views: [{ label: 'Frame', outline: 'whole_side', required: true }] } }, now())
    if (!saved.ok) throw new Error(saved.reason)
    await addItems(transaction, { itemTypeId: saved.id, count: 20, size: '', serial: '' }, now())
    return saved.id
  })
  const inThisShop = <Result>(work: (transaction: Transaction) => Promise<Result>) => inShop(database, { role: 'hold_app', shopId }, work)
  let day = 0

  async function waitingRental(approved: boolean) {
    day += 2
    const startsAt = new Date(now().getTime() + day * 86_400_000)
    const booked = await inThisShop((transaction) =>
      createBooking(
        transaction,
        shopId,
        { startsAt, endsAt: new Date(startsAt.getTime() + 86_400_000), lines: [{ itemTypeId: typeId, count: 1 }], contact: undefined, language: 'en', bookedThrough: 'shop_page', link: { fingerprint: `link-${String(day)}`, expiresAt: new Date('2027-06-01') } },
        now(),
      ),
    )
    if (!booked.ok) throw new Error(booked.reason)
    const order = await fake.createFeeOrder({ amount: eur(FEE), rentalReference: booked.rentalId, description: 'Fee', returnUrl: 'https://hold.test/paid', cancelUrl: 'https://hold.test/r', idempotencyKey: `fee-order-${booked.rentalId}` })
    if (!order.ok) throw new Error(order.error.kind)
    await inThisShop((transaction) => saveFeeOrder(transaction, booked.rentalId, order.value.orderId))
    if (approved) fake.approveOrder(order.value.orderId)
    return { rentalId: booked.rentalId, orderId: order.value.orderId }
  }

  return {
    database,
    fake,
    shopId,
    inShop: inThisShop,
    waitingRental,
    async approvedHold(dependencies, options = {}) {
      const { rentalId } = await waitingRental(true)
      const fee = await requestFeeCapture(dependencies, shopId, rentalId)
      if (!fee.ok) throw new Error(fee.reason)
      await runExecution(dependencies, { shopId, executionId: fee.executionId })
      await inThisShop((transaction) => askForHold(transaction, rentalId, now()))
      const order = await fake.createHoldOrder({ amount: eur(HOLD), rentalReference: rentalId, description: 'Hold', returnUrl: 'https://hold.test/pay', cancelUrl: 'https://hold.test/r', idempotencyKey: `hold-order-${rentalId}` })
      if (!order.ok) throw new Error(order.error.kind)
      await inThisShop((transaction) => saveHoldOrder(transaction, rentalId, order.value.orderId))
      if (options.approve !== false) fake.approveOrder(order.value.orderId)
      return { rentalId, orderId: order.value.orderId }
    },
    async approvedWalkIn() {
      day += 2
      const startsAt = new Date(now().getTime() + 3_600_000)
      const booked = await inThisShop((transaction) =>
        createBooking(
          transaction,
          shopId,
          { startsAt, endsAt: new Date(startsAt.getTime() + 86_400_000), lines: [{ itemTypeId: walkInTypeId, count: 1 }], contact: undefined, language: 'en', bookedThrough: 'staff', placement: 'combined', link: { fingerprint: `walk-in-${String(day)}`, expiresAt: new Date('2027-06-01') } },
          now(),
        ),
      )
      if (!booked.ok) throw new Error(booked.reason)
      const order = await fake.createHoldOrder({ amount: eur(FEE + HOLD), rentalReference: booked.rentalId, description: 'Fee and hold', returnUrl: 'https://hold.test/pay', cancelUrl: 'https://hold.test/r', idempotencyKey: `walk-in-order-${booked.rentalId}` })
      if (!order.ok) throw new Error(order.error.kind)
      await inThisShop((transaction) => saveHoldOrder(transaction, booked.rentalId, order.value.orderId))
      fake.approveOrder(order.value.orderId)
      return { rentalId: booked.rentalId, orderId: order.value.orderId }
    },
    async delivered(type, resource, signature = FAKE_SIGNATURE) {
      const paypalEventId = `WH-${String(Math.random()).slice(2, 12)}`
      const body = JSON.stringify({ id: paypalEventId, event_type: type, resource })
      const headers = { 'paypal-transmission-id': paypalEventId, 'paypal-transmission-time': '2026-10-15T09:00:00Z', 'paypal-transmission-sig': signature, 'paypal-cert-url': 'fake', 'paypal-auth-algo': 'fake' }
      const recorded = await recordPayPalEvent(database, accountId, { eventId: paypalEventId, type, resourceId: String(resource['id']), rawBody: body, headers }, now())
      if (!recorded.ok) throw new Error(recorded.reason)
      const [event] = await database.select({ id: paypalEvents.id }).from(paypalEvents).where(eq(paypalEvents.paypalEventId, paypalEventId))
      return event?.id ?? ''
    },
  }
}
