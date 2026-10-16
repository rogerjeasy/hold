import { beginHoldPlacement, confirmAuthorizationReleased, confirmHoldPlaced, failExecution, holdUpkeep } from '@hold/db'
import type { PlacedAuthorization, StoredExecution } from '@hold/db'
import type { PayPalHolds } from '@hold/paypal'
import { PayPalUnavailable, TRANSIENT } from './dependencies.ts'
import type { RequestDependencies, SettleDependencies } from './dependencies.ts'
import { inWorkerShop, sendExecution } from './execution-queue.ts'
import type { ExecutionOutcome, RequestResult } from './execution-queue.ts'
import type { EventProcessing } from './fee-capture.ts'
import { scheduleUpkeep, upkeepScheduleName } from './upkeep-schedules.ts'

// Placing the hold the renter approved at the counter (architecture.md section 8.4). The worker authorizes the order
// with the execution's key; the hold counts as placed once PayPal reads back a created authorization for the agreed
// amount, and only then are its upkeep schedules made.

// Records the authorization of an approved hold and sends it to the worker at once. Asked again, it sends the same one.
export async function requestHoldPlacement(dependencies: RequestDependencies, shopId: string, rentalId: string): Promise<RequestResult> {
  const begun = await inWorkerShop(dependencies, shopId, (transaction) => beginHoldPlacement(transaction, rentalId, dependencies.now()))
  if (!begun.ok) return begun
  await sendExecution(dependencies, shopId, rentalId, begun.execution.id)
  return { ok: true, executionId: begun.execution.id }
}

async function confirmPlacement(dependencies: SettleDependencies, shopId: string, executionId: string, authorization: PlacedAuthorization): Promise<ExecutionOutcome> {
  const confirmed = await inWorkerShop(dependencies, shopId, (transaction) => confirmHoldPlaced(transaction, executionId, authorization, dependencies.now()))
  if (!confirmed.ok) return confirmed.reason === 'pending' ? 'waiting' : 'failed'
  // A failure here throws, so the queue tries again and ensureUpkeep makes the schedules then.
  await scheduleUpkeep(dependencies, shopId, confirmed.upkeep)
  if (confirmed.replaced !== undefined) {
    // A replacement: the old hold's schedules end, and it is released. Its execution is in the outbox if sending fails.
    await dependencies.scheduler.remove(upkeepScheduleName('replace', confirmed.replaced.authorizationId))
    await dependencies.scheduler.remove(upkeepScheduleName('expire', confirmed.replaced.authorizationId))
    await sendExecution(dependencies, shopId, confirmed.replaced.rentalId, confirmed.replaced.releaseExecutionId)
  }
  return 'confirmed'
}

// Throws while PayPal cannot be reached, so the queue tries again. A declined funding source fails the execution, and
// the renter may approve again, perhaps with another source.
export async function authorizeHold(dependencies: SettleDependencies, shopId: string, execution: Pick<StoredExecution, 'id' | 'orderId' | 'idempotencyKey'>, paypal: PayPalHolds): Promise<ExecutionOutcome> {
  const fail = async (reason: string) => {
    await inWorkerShop(dependencies, shopId, (transaction) => failExecution(transaction, execution.id, reason, dependencies.now()))
    return 'failed' as const
  }
  if (execution.orderId === undefined) return fail('No order.')
  const placed = await paypal.placeHold({ orderId: execution.orderId, idempotencyKey: execution.idempotencyKey })
  if (!placed.ok) {
    if (TRANSIENT.has(placed.error.kind)) throw new PayPalUnavailable(placed.error.kind)
    return fail(placed.error.kind)
  }
  return confirmPlacement(dependencies, shopId, execution.id, placed.value)
}

// Makes the schedules a placed hold needs, if it still needs them. Safe to repeat.
export async function ensureUpkeep(dependencies: SettleDependencies, shopId: string, holdId: string): Promise<void> {
  const upkeep = await inWorkerShop(dependencies, shopId, (transaction) => holdUpkeep(transaction, holdId))
  if (upkeep !== undefined) await scheduleUpkeep(dependencies, shopId, upkeep)
}

// An event about a hold order. Nothing in the event is believed: the order or the authorization is read back.
export async function applyHoldEvent(
  dependencies: SettleDependencies,
  shopId: string,
  paypal: PayPalHolds,
  event: { readonly type: string; readonly orderId: string; readonly resourceId: string | undefined },
  rentalId: string,
): Promise<EventProcessing> {
  const now = dependencies.now()
  if (event.type === 'CHECKOUT.ORDER.APPROVED') {
    // The renter approved the hold but may never have come back to Hold.
    const order = await paypal.readHoldOrder(event.orderId)
    if (!order.ok) throw new PayPalUnavailable(order.error.kind)
    if (order.value.status !== 'approved') return 'ignored'
    const begun = await inWorkerShop(dependencies, shopId, (transaction) => beginHoldPlacement(transaction, rentalId, now))
    if (!begun.ok) return 'ignored'
    return (await authorizeHold(dependencies, shopId, begun.execution, paypal)) === 'failed' ? 'failed' : 'applied'
  }
  if (event.type !== 'PAYMENT.AUTHORIZATION.CREATED' || event.resourceId === undefined) return 'ignored'
  // PayPal authorized the hold, perhaps for a request whose reply was lost. The authorization is read back.
  const authorization = await paypal.readAuthorization(event.resourceId)
  if (!authorization.ok) {
    if (TRANSIENT.has(authorization.error.kind)) throw new PayPalUnavailable(authorization.error.kind)
    return 'ignored'
  }
  const begun = await inWorkerShop(dependencies, shopId, (transaction) => beginHoldPlacement(transaction, rentalId, now, { confirming: true, orderId: event.orderId }))
  if (!begun.ok) return 'ignored'
  return (await confirmPlacement(dependencies, shopId, begun.execution.id, authorization.value)) === 'failed' ? 'failed' : 'applied'
}

// Voids an authorization a replacement took over from, then confirms it from PayPal's read-back. One already voided
// is read back the same way.
export async function releaseReplaced(dependencies: SettleDependencies, shopId: string, execution: Pick<StoredExecution, 'id' | 'idempotencyKey' | 'authorizationId'>, paypal: PayPalHolds): Promise<ExecutionOutcome> {
  const now = dependencies.now()
  if (execution.authorizationId === undefined) {
    await inWorkerShop(dependencies, shopId, (transaction) => failExecution(transaction, execution.id, 'No authorization.', now))
    return 'failed'
  }
  const released = await paypal.releaseHold({ authorizationId: execution.authorizationId, idempotencyKey: execution.idempotencyKey })
  const readBack = released.ok ? released : released.error.kind === 'hold_voided' ? await paypal.readAuthorization(execution.authorizationId) : released
  if (!readBack.ok) {
    if (TRANSIENT.has(readBack.error.kind)) throw new PayPalUnavailable(readBack.error.kind)
    await inWorkerShop(dependencies, shopId, (transaction) => failExecution(transaction, execution.id, readBack.error.kind, now))
    return 'failed'
  }
  const confirmed = await inWorkerShop(dependencies, shopId, (transaction) => confirmAuthorizationReleased(transaction, execution.id, readBack.value, now))
  return confirmed.ok ? 'confirmed' : 'failed'
}
