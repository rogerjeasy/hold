import { addSampleRentals, approveClaim, claimWorkspace, confirmCleanReturn, draftClaim, executions, inShop, moneyEvents, presentClaim, publishPriceList, registerOwner, rentalPayPalRecord, rentals, replyToClaim, staffRoles } from '@hold/db'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { applyPayPalEvent, createMemoryScheduler, requestHoldPlacement, runExecution } from './index.ts'
import type { SettleDependencies } from './index.ts'
import { createSettleFixture, FEE, HOLD } from './testing/settle-fixture.ts'

// The PayPal record on a rental's page (architecture.md section 11.8): every call Hold made to PayPal for the rental,
// with PayPal's own ids and status, the PayPal-Request-Id it was sent with, and what confirmed it.

const NOW = new Date('2026-10-20T09:00:00Z')
let fixture: Awaited<ReturnType<typeof createSettleFixture>>
let userId: string
const dependencies = (): SettleDependencies => ({ database: fixture.database, paypalFor: () => fixture.fake, paypalMode: 'sandbox', send: () => Promise.resolve(), scheduler: createMemoryScheduler(), notifier: { tell: () => Promise.resolve() }, renterAsk: { approval: () => Promise.reject(new Error('Not used')) }, now: () => NOW })
const act = <Result>(work: Parameters<typeof fixture.inShop<Result>>[0]) => inShop(fixture.database, { role: 'hold_app', shopId: fixture.shopId, userId }, work)
const record = (rentalId: string) => act((transaction) => rentalPayPalRecord(transaction, rentalId))
const sent = (rentalId: string, action: string) => act(async (transaction) => (await transaction.select().from(executions).where(eq(executions.rentalId, rentalId))).find((row) => row.action === action))

async function placed() {
  const rental = await fixture.approvedHold(dependencies())
  const placement = await requestHoldPlacement(dependencies(), fixture.shopId, rental.rentalId)
  if (!placement.ok) throw new Error(placement.reason)
  await runExecution(dependencies(), { shopId: fixture.shopId, executionId: placement.executionId })
  return rental
}

async function charged(rentalId: string) {
  await fixture.database.update(rentals).set({ state: 'inspecting' }).where(eq(rentals.id, rentalId))
  const price = (await act((transaction) => claimWorkspace(transaction, rentalId)))?.prices[0]?.id ?? ''
  const drafted = await act((transaction) => draftClaim(transaction, rentalId, userId, [{ priceEntryId: price, reason: 'Scratch confirmed in person.' }], NOW))
  if (!drafted.ok) throw new Error(drafted.reason)
  await act((transaction) => approveClaim(transaction, drafted.claimId, userId, NOW))
  await act((transaction) => presentClaim(transaction, drafted.claimId, userId, NOW))
  const accepted = await act((transaction) => replyToClaim(transaction, rentalId, 'accept', '', NOW))
  if (!accepted.ok || accepted.executionId === null) throw new Error('No capture requested')
  await runExecution(dependencies(), { shopId: fixture.shopId, executionId: accepted.executionId })
}

beforeAll(async () => {
  fixture = await createSettleFixture(() => NOW)
  userId = (await fixture.inShop((transaction) => transaction.select().from(staffRoles)))[0]?.userId ?? ''
})

describe('the PayPal record of a rental', () => {
  it('lists the fee capture and the hold placement with PayPal’s ids, its status, the PayPal-Request-Id sent and the read-back', async () => {
    const { rentalId, orderId } = await placed()
    const fee = await sent(rentalId, 'fee_capture')
    const authorize = await sent(rentalId, 'authorize')
    const shown = await record(rentalId)
    expect(shown?.simulated).toBe(false)
    expect(shown?.lines.map((line) => line.kind)).toEqual(['fee_captured', 'hold_placed'])
    expect(shown?.lines[0]).toMatchObject({ action: 'fee_capture', amountCents: FEE, currency: 'EUR', paypalStatus: 'COMPLETED', finalCapture: null, requestId: fee?.idempotencyKey, callState: 'confirmed', ids: { order: fee?.paypalResourceIds['order'], capture: fee?.paypalResourceIds['capture'] }, event: null })
    expect(shown?.lines[0]?.readBackAt).toBeInstanceOf(Date)
    expect(shown?.lines[1]).toMatchObject({ action: 'authorize', amountCents: HOLD, paypalStatus: 'CREATED', requestId: authorize?.idempotencyKey, ids: { order: orderId, authorization: authorize?.paypalResourceIds['authorization'] }, authorizationState: 'created' })
  })

  it('shows the damage capture as final, the remainder it released, and the authorization now captured', async () => {
    const { rentalId } = await placed()
    await charged(rentalId)
    const capture = await sent(rentalId, 'capture')
    const shown = await record(rentalId)
    expect(shown?.lines.map((line) => line.kind)).toEqual(['fee_captured', 'hold_placed', 'hold_captured', 'hold_released'])
    expect(shown?.lines[2]).toMatchObject({ action: 'capture', amountCents: 35_00, paypalStatus: 'COMPLETED', finalCapture: true, requestId: capture?.idempotencyKey, ids: { authorization: capture?.paypalResourceIds['authorization'], capture: capture?.paypalResourceIds['capture'] } })
    // PayPal releases what a final capture leaves of the hold in the same call: the line carries that call's key.
    expect(shown?.lines[3]).toMatchObject({ action: 'capture', amountCents: HOLD - 35_00, paypalStatus: 'CAPTURED', requestId: capture?.idempotencyKey })
    expect(shown?.lines[1]?.authorizationState).toBe('captured')
  })

  it('names the verified PayPal event that confirmed a line, and never one whose signature failed', async () => {
    const { rentalId } = await placed()
    await charged(rentalId)
    const captureId = (await sent(rentalId, 'capture'))?.paypalResourceIds['capture'] ?? ''
    await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId: await fixture.delivered('PAYMENT.CAPTURE.COMPLETED', { id: captureId, status: 'COMPLETED' }, 'forged') })
    expect((await record(rentalId))?.lines[2]?.event).toBeNull()
    await applyPayPalEvent(dependencies(), { shopId: fixture.shopId, eventId: await fixture.delivered('PAYMENT.CAPTURE.COMPLETED', { id: captureId, status: 'COMPLETED' }) })
    const line = (await record(rentalId))?.lines[2]
    expect(line?.event).toMatchObject({ type: 'PAYMENT.CAPTURE.COMPLETED', simulated: false })
    expect(line?.event?.eventId).toMatch(/^WH-/)
    // An event about the capture never confirms the hold's placement, though both name the same authorization's money.
    expect((await record(rentalId))?.lines[1]?.event).toBeNull()
  })

  it('shows a call PayPal has not confirmed yet as waiting, with the key it is sent with', async () => {
    const { rentalId } = await placed()
    await fixture.database.update(rentals).set({ state: 'inspecting' }).where(eq(rentals.id, rentalId))
    const requested = await act((transaction) => confirmCleanReturn(transaction, rentalId, userId, 'Inspected in person: no new damage.', NOW))
    if (!requested.ok) throw new Error(requested.reason)
    const release = await sent(rentalId, 'release')
    const shown = await record(rentalId)
    expect(shown?.lines.at(-1)).toMatchObject({ kind: null, action: 'release', callState: 'pending', requestId: release?.idempotencyKey, paypalStatus: null, readBackAt: null, ids: { authorization: release?.paypalResourceIds['authorization'] } })
    // Hold's own references, such as the claim or the purpose of a call, are not PayPal's ids and are not shown.
    expect(Object.keys(shown?.lines.at(-1)?.ids ?? {})).toEqual(['authorization'])
    await runExecution(dependencies(), { shopId: fixture.shopId, executionId: requested.executionId })
    expect((await record(rentalId))?.lines.at(-1)).toMatchObject({ kind: 'hold_released', action: 'release', paypalStatus: 'VOIDED', callState: 'confirmed', requestId: release?.idempotencyKey })
  })

  it('marks a sample rental’s whole record simulated, and shows another shop nothing', async () => {
    const demo = await registerOwner(fixture.database, { subject: 'owner-demo', email: 'demo@ribeira.example', name: 'Ana', language: 'en', shop: { name: 'Ribeira Demo', timeZone: 'UTC' } })
    const scope = { role: 'hold_app', shopId: demo.shopId, userId: demo.userId } as const
    const sample = await inShop(fixture.database, scope, async (transaction) => {
      await publishPriceList(transaction, demo.shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries: [{ description: 'Scratch', category: 'damage', amount: { cents: 35_00, currency: 'EUR' } }], wearPolicy: 'Wear.' }, NOW)
      const added = await addSampleRentals(transaction, { shopId: demo.shopId, userId: demo.userId, timeZone: 'UTC', now: NOW })
      if (!added.ok) throw new Error(added.reason)
      const logged = await transaction.select({ rentalId: moneyEvents.rentalId }).from(moneyEvents).where(eq(moneyEvents.kind, 'hold_captured'))
      return logged[0]?.rentalId ?? ''
    })
    const shown = await inShop(fixture.database, scope, (transaction) => rentalPayPalRecord(transaction, sample))
    expect(shown?.simulated).toBe(true)
    expect(shown?.lines.map((line) => line.kind)).toEqual(['fee_captured', 'hold_placed', 'hold_captured', 'hold_released'])
    expect(await record(sample)).toBeUndefined()
  })
})
