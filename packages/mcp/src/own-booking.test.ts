import { addDays } from '@hold/domain'
import { createBooking, latestOwnBooking, rentals, revokeAssistant } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import type { TestDatabase } from '@hold/db/testing'
import { readyRentalShop } from '@hold/db/testing/ready-rental'
import type { ReadyRentalShop } from '@hold/db/testing/ready-rental'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { followOwnBooking } from './own-booking.ts'
import { connectClient, testPorts } from './testing.ts'

// The demo visitor asks the hosted assistant about the booking they just made at their own demo shop's counter. Hold
// binds a booking secret to it, and the assistant then reads it as any assistant would: get_booking through the MCP
// server and its gateway, and, once the fee is paid, the rental tools with the token get_booking issues.

const HOSTED = 'Hold hosted assistant (demonstration)'
const now = new Date()
let database: TestDatabase
let shop: ReadyRentalShop
let client: Client
let counter = 0

beforeAll(async () => { database = await createTestDatabase() })
afterAll(async () => { await database.$client.close() })
beforeEach(async () => {
  counter += 1
  shop = await readyRentalShop(database, `own-booking-${String(counter)}`, now)
  client = await connectClient(testPorts(database), `203.0.113.${String(60 + counter)}`, HOSTED)
})

const call = async (name: string, args: Record<string, unknown>) => {
  const result = await client.callTool({ name, arguments: args })
  return { isError: result.isError === true, data: (result.structuredContent ?? JSON.parse((result.content as readonly { text: string }[])[0]?.text ?? '{}')) as Record<string, unknown> }
}
const follow = (label = HOSTED) => followOwnBooking(testPorts(database), shop.scope.shopId, label)
// A booking made at the counter whose fee is not paid yet.
const unpaid = () => shop.act(async (transaction) => {
  const created = await createBooking(transaction, shop.scope.shopId, { lines: [{ itemTypeId: shop.typeId, count: 1 }], startsAt: addDays(now, 40), endsAt: addDays(now, 41), contact: { name: 'Judge', email: 'judge@example.com' }, language: 'en', bookedThrough: 'staff', link: { fingerprint: `judge-${String(counter)}`, expiresAt: addDays(now, 300) } }, now)
  if (!created.ok) throw new Error(created.reason)
  return created.rentalId
})

describe('following the demo visitor’s own latest booking', () => {
  it('says there is none when the shop has no booking of its own', async () => {
    expect(await follow()).toEqual({ ok: false, reason: 'no_booking' })
  })

  it('reads a booking waiting for payment through get_booking, and tells the time to pay by', async () => {
    const rentalId = await unpaid()
    const followed = await follow()
    if (!followed.ok) throw new Error(followed.reason)
    expect(followed.rentalId).toBe(rentalId)
    const booking = await call('get_booking', { booking_secret: followed.bookingSecret })
    expect(booking).toMatchObject({ isError: false, data: { status: 'awaiting_payment', token: 'not_yet', agent_token: null } })
    expect(typeof booking.data['pay_by']).toBe('string')
  })

  it('once the fee is paid, gets its token from get_booking and reads the rental with it, through the gateway', async () => {
    const { rentalId } = await shop.readyRental()
    const followed = await follow()
    if (!followed.ok) throw new Error(followed.reason)
    const booking = await call('get_booking', { booking_secret: followed.bookingSecret })
    expect(booking.data).toMatchObject({ status: 'paid', rental_id: rentalId, token: 'issued_now' })
    const rental = await call('get_rental', { rental_id: rentalId, agent_token: booking.data['agent_token'] })
    expect(rental).toMatchObject({ isError: false, data: { rental_id: rentalId, fee: { cents: 40_00, currency: 'EUR' }, hold: { cents: 300_00, currency: 'EUR' } } })
  })

  // A rental has one assistant at most, and its booking secret and token are issued once (migration 0026).
  it('follows the latest booking only, never a sample, and only once: asked again, the first secret stays the one that works', async () => {
    const { rentalId } = await shop.readyRental()
    const sample = await unpaid()
    await shop.act((transaction) => transaction.update(rentals).set({ simulated: true }).where(eq(rentals.id, sample)))
    const first = await follow()
    if (!first.ok) throw new Error(first.reason)
    expect(first.rentalId).toBe(rentalId)
    expect(await follow()).toEqual({ ok: false, reason: 'already_followed' })
    expect(await shop.act((transaction) => latestOwnBooking(transaction))).toEqual({ rentalId, followable: false })
    expect(await call('get_booking', { booking_secret: first.bookingSecret })).toMatchObject({ isError: false, data: { status: 'paid' } })
  })

  it('leaves a booking an assistant already follows, the one that made it or one the renter disconnected', async () => {
    const rentalId = await unpaid()
    expect(await follow('Someone else’s assistant')).toMatchObject({ ok: true })
    expect(await follow()).toEqual({ ok: false, reason: 'already_followed' })
    await shop.act((transaction) => revokeAssistant(transaction, rentalId, now))
    expect(await follow()).toEqual({ ok: false, reason: 'already_followed' })
  })
})
