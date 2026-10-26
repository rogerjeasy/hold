import { authorizationClocks, checkPlacedAuthorization, HOLD_TRANSITIONS, mayAskForHold, money, planUpkeep, RENTAL_TRANSITIONS, transition } from '@hold/domain'
import type { HoldState, PlacedAuthorizationStatus, UpkeepSchedule } from '@hold/domain'
import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm'
import { EXECUTIONS_QUEUE, markExecutionSent } from './fee-repository.ts'
import { authorizations, executions, holds, moneyEvents, outbox, rentals, trustLadders } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// The hold placed at pickup (architecture.md sections 8.2 and 8.4). Staff ask for it, the renter approves it in PayPal,
// and the worker authorizes it through an execution. It counts as placed only once PayPal reads back a created
// authorization for the amount agreed at booking. Each step is safe to repeat.

export type RentalHold = {
  readonly id: string
  readonly state: HoldState
  readonly strategy: 'at_counter' | 'combined' | 'saved_method'
  readonly reservedCents: number
  readonly currency: string
  // The order the renter is approving now: the hold's own until it is placed, then a replacement's while one is asked
  // for. Null when there is nothing to approve.
  readonly orderId: string | null
  readonly paypalAuthorizationId: string | null
  readonly assuredUntil: Date | null
  readonly validUntil: Date | null
  // Why PayPal refused to place the hold on the order the renter approved, such as `declined`. The renter may then
  // approve again, perhaps with another funding source, which makes a new order.
  readonly placementFailure: string | null
  // The hold the renter agreed to at booking, which the reserved amount is never above.
  readonly ordinaryCents: number
  // Why the reserved amount is lower: the ladder version and rung, the clean returns and the window. Null when the
  // ordinary hold applies.
  readonly trust: { readonly version: number; readonly rung: number; readonly cleanReturns: number; readonly windowMonths: number } | null
}

export async function rentalHold(transaction: Transaction, rentalId: string): Promise<RentalHold | undefined> {
  const [row] = await transaction
    .select({
      id: holds.id,
      state: holds.state,
      strategy: holds.strategy,
      reservedCents: holds.reservedCents,
      currency: holds.currency,
      paypalOrderId: holds.paypalOrderId,
      replacementOrderId: holds.replacementOrderId,
      paypalAuthorizationId: authorizations.paypalAuthorizationId,
      assuredUntil: authorizations.assuredUntil,
      validUntil: authorizations.validUntil,
      ordinaryCents: holds.ordinaryCents,
      trustRung: holds.trustRung,
      cleanReturns: holds.cleanReturns,
      ladderVersion: trustLadders.version,
      windowMonths: trustLadders.windowMonths,
    })
    .from(holds)
    .leftJoin(authorizations, eq(authorizations.id, holds.currentAuthorizationId))
    .leftJoin(trustLadders, eq(trustLadders.id, holds.trustLadderId))
    .where(eq(holds.rentalId, rentalId))
  if (row === undefined) return undefined
  const { paypalOrderId, replacementOrderId, ordinaryCents, trustRung, cleanReturns, ladderVersion, windowMonths, ...hold } = row
  const trust = trustRung !== null && cleanReturns !== null && ladderVersion !== null && windowMonths !== null ? { version: ladderVersion, rung: trustRung, cleanReturns, windowMonths } : null
  const orderId = pendingOrder({ state: row.state, paypalOrderId, replacementOrderId })
  const [failed] =
    orderId === null
      ? []
      : await transaction
          .select({ lastError: executions.lastError })
          .from(executions)
          .where(and(eq(executions.holdId, row.id), eq(executions.action, 'authorize'), eq(executions.state, 'failed'), sql`${executions.paypalResourceIds} ->> 'order' = ${orderId}`))
  return { ...hold, orderId, placementFailure: failed?.lastError ?? null, ordinaryCents: ordinaryCents ?? hold.reservedCents, trust }
}

// The order the renter is approving: the hold's own while it is requested, a replacement's while the hold is placed.
function pendingOrder(hold: { readonly state: HoldState; readonly paypalOrderId: string | null; readonly replacementOrderId: string | null }): string | null {
  if (hold.state === 'requested') return hold.paypalOrderId
  return hold.state === 'placed' || hold.state === 'at_risk' ? hold.replacementOrderId : null
}

export type AskResult = { readonly ok: true; readonly holdId: string } | { readonly ok: false; readonly reason: 'not_found' | 'not_booked' }

// The hold the shop's trust ladder gives this renter (extensions.md section 7.5), worked out by plain code from their
// record. Trust only ever lowers a hold, so anything else is ignored and the ordinary hold applies.
export type TrustedHold = { readonly reservedCents: number; readonly ordinaryCents: number; readonly ladderId: string; readonly rung: number; readonly cleanReturns: number }

function lowers(trust: TrustedHold | undefined, holdCents: number): trust is TrustedHold {
  return trust !== undefined && trust.ordinaryCents === holdCents && Number.isSafeInteger(trust.reservedCents) && trust.reservedCents >= 0 && trust.reservedCents <= holdCents && trust.rung > 0
}

// Requests the hold the renter agreed to at booking, or the lower one the shop's ladder gives them, placed at the
// counter. The rental then waits for it, and keeps the ladder version and rung it was placed under. Asked again, it
// gives the same hold.
export async function askForHold(transaction: Transaction, rentalId: string, now: Date, trust?: TrustedHold): Promise<AskResult> {
  const [rental] = await transaction
    .select({ shopId: rentals.shopId, state: rentals.state, holdCents: rentals.holdCents, currency: rentals.currency })
    .from(rentals)
    .where(eq(rentals.id, rentalId))
    .for('update')
  if (rental === undefined) return { ok: false, reason: 'not_found' }
  const [existing] = await transaction.select({ id: holds.id }).from(holds).where(eq(holds.rentalId, rentalId))
  if (existing !== undefined) return { ok: true, holdId: existing.id }
  if (!mayAskForHold(rental.state)) return { ok: false, reason: 'not_booked' }
  const ladder = lowers(trust, rental.holdCents) ? { reservedCents: trust.reservedCents, trustLadderId: trust.ladderId, trustRung: trust.rung, cleanReturns: trust.cleanReturns } : { reservedCents: rental.holdCents }
  const [created] = await transaction
    .insert(holds)
    .values({ shopId: rental.shopId, rentalId, currency: rental.currency, ordinaryCents: rental.holdCents, ...ladder, strategy: 'at_counter', createdAt: now })
    .returning({ id: holds.id })
  if (created === undefined) throw new Error('The hold was not created.')
  if ('trustLadderId' in ladder) await transaction.update(rentals).set({ trustLadderId: ladder.trustLadderId, trustRung: ladder.trustRung }).where(eq(rentals.id, rentalId))
  if (transition(RENTAL_TRANSITIONS, rental.state, 'awaiting_hold').ok) await transaction.update(rentals).set({ state: 'awaiting_hold' }).where(eq(rentals.id, rentalId))
  return { ok: true, holdId: created.id }
}

// Keeps the order the renter is approving, so a second visit reuses it: the hold's own, or a new one for a replacement
// after the first was declined.
export async function saveHoldOrder(transaction: Transaction, rentalId: string, orderId: string): Promise<void> {
  await transaction.update(holds).set({ paypalOrderId: orderId }).where(and(eq(holds.rentalId, rentalId), eq(holds.state, 'requested')))
  await transaction
    .update(holds)
    .set({ replacementOrderId: orderId })
    .where(and(eq(holds.rentalId, rentalId), inArray(holds.state, ['placed', 'at_risk']), isNotNull(holds.replacementOrderId)))
}

// The rental whose hold PayPal's event names by its order. Nothing for a fee order or an unknown one.
export async function holdRentalByOrder(transaction: Transaction, orderId: string): Promise<string | undefined> {
  const [row] = await transaction.select({ rentalId: holds.rentalId }).from(holds).where(or(eq(holds.paypalOrderId, orderId), eq(holds.replacementOrderId, orderId)))
  return row?.rentalId
}

// The rental whose hold PayPal's event names by one of its authorizations, such as one a replacement released.
export async function holdRentalByAuthorization(transaction: Transaction, paypalAuthorizationId: string): Promise<string | undefined> {
  const [row] = await transaction
    .select({ rentalId: holds.rentalId })
    .from(authorizations)
    .innerJoin(holds, eq(holds.id, authorizations.holdId))
    .where(eq(authorizations.paypalAuthorizationId, paypalAuthorizationId))
  return row?.rentalId
}

export type HoldExecution = {
  readonly id: string
  readonly rentalId: string
  readonly holdId: string
  readonly orderId: string
  readonly idempotencyKey: string
  readonly amountCents: number
  readonly currency: string
}

export type BeginPlacementResult = { readonly ok: true; readonly execution: HoldExecution } | { readonly ok: false; readonly reason: 'not_found' | 'no_order' | 'not_requested' }

// Records that the approved order is to be authorized: one execution, keyed by the hold and its order, and the outbox
// message that lets the worker finish it. Asked again, it returns the same execution. `confirming` is for an
// authorization PayPal already made on `orderId`, one of the hold's own orders, which is recorded whatever the hold's
// state.
export async function beginHoldPlacement(transaction: Transaction, rentalId: string, now: Date, options: { readonly confirming?: boolean; readonly orderId?: string } = {}): Promise<BeginPlacementResult> {
  const [hold] = await transaction
    .select({ id: holds.id, shopId: holds.shopId, state: holds.state, paypalOrderId: holds.paypalOrderId, replacementOrderId: holds.replacementOrderId, reservedCents: holds.reservedCents, currency: holds.currency })
    .from(holds)
    .where(eq(holds.rentalId, rentalId))
    .for('update')
  if (hold === undefined) return { ok: false, reason: 'not_found' }
  const named = options.confirming === true && options.orderId !== undefined && [hold.paypalOrderId, hold.replacementOrderId].includes(options.orderId) ? options.orderId : null
  const orderId = named ?? pendingOrder(hold)
  if (orderId === null) return { ok: false, reason: 'no_order' }
  const idempotencyKey = `hold-authorize-${hold.id}-${orderId}`
  const execution = (id: string): HoldExecution => ({ id, rentalId, holdId: hold.id, orderId, idempotencyKey, amountCents: hold.reservedCents, currency: hold.currency })
  const [existing] = await transaction.select({ id: executions.id }).from(executions).where(eq(executions.idempotencyKey, idempotencyKey))
  if (existing !== undefined) return { ok: true, execution: execution(existing.id) }
  if (options.confirming !== true && hold.state !== 'requested' && hold.replacementOrderId === null) return { ok: false, reason: 'not_requested' }
  const [created] = await transaction
    .insert(executions)
    .values({ shopId: hold.shopId, rentalId, holdId: hold.id, action: 'authorize', idempotencyKey, currency: hold.currency, amountCents: hold.reservedCents, paypalResourceIds: { order: orderId }, createdAt: now, updatedAt: now })
    .returning({ id: executions.id })
  if (created === undefined) throw new Error('The execution was not created.')
  await transaction.insert(outbox).values({ shopId: hold.shopId, queue: EXECUTIONS_QUEUE, messageGroup: rentalId, payload: { executionId: created.id }, createdAt: now })
  return { ok: true, execution: execution(created.id) }
}

// What PayPal read back for the authorization.
export type PlacedAuthorization = {
  readonly authorizationId: string
  readonly status: PlacedAuthorizationStatus
  readonly amount: { readonly cents: number; readonly currency: string }
  readonly createdAt: Date
  readonly expiresAt: Date
}

// The schedules a placed hold needs, for the authorization it rests on.
export type HoldUpkeep = UpkeepSchedule & { readonly holdId: string; readonly authorizationId: string }

export type ConfirmPlacementResult =
  // `replaced` names the authorization a replacement took over from, whose schedules end, and the execution that
  // releases it.
  | { readonly ok: true; readonly upkeep: HoldUpkeep; readonly replaced: { readonly authorizationId: string; readonly releaseExecutionId: string; readonly rentalId: string } | undefined }
  | { readonly ok: false; readonly reason: 'not_found' | 'pending' | 'amount_mismatch' | 'not_placed' }

// Applies what PayPal read back: both clocks are recorded, the hold is placed, the money log gets one line and the
// rental is ready for handover. For a replacement, the hold moves onto the new authorization and the old one's release
// is recorded. Applying the same authorization again changes nothing.
export async function confirmHoldPlaced(transaction: Transaction, executionId: string, placed: PlacedAuthorization, now: Date): Promise<ConfirmPlacementResult> {
  const [execution] = await transaction.select().from(executions).where(eq(executions.id, executionId)).for('update')
  if (execution === undefined || execution.holdId === null || execution.amountCents === null || execution.currency === null) return { ok: false, reason: 'not_found' }
  const { holdId } = execution
  const checked = checkPlacedAuthorization(money(execution.amountCents, execution.currency), placed)
  if (!checked.ok) {
    const state = checked.error === 'pending' ? 'submitted' : 'failed'
    await transaction.update(executions).set({ state, attempts: execution.attempts + 1, lastError: checked.error, updatedAt: now }).where(eq(executions.id, executionId))
    return { ok: false, reason: checked.error }
  }

  // A placed hold getting a new authorization is a replacement: the hold moves onto it, and the old one is released.
  const [hold] = await transaction.select({ state: holds.state, current: holds.currentAuthorizationId }).from(holds).where(eq(holds.id, holdId)).for('update')
  if (hold === undefined) return { ok: false, reason: 'not_found' }
  const [known] = await transaction.select({ id: authorizations.id }).from(authorizations).where(eq(authorizations.paypalAuthorizationId, placed.authorizationId))
  const replacing = known === undefined && hold.current !== null && (hold.state === 'placed' || hold.state === 'at_risk') ? hold.current : null

  const surplus = known === undefined && hold.current !== null && replacing === null
  const clocks = authorizationClocks(placed, false)
  await transaction
    .insert(authorizations)
    .values({ shopId: execution.shopId, holdId, paypalAuthorizationId: placed.authorizationId, currency: placed.amount.currency, amountCents: placed.amount.cents, createdAt: placed.createdAt, assuredUntil: clocks.assuredUntil, validUntil: clocks.validUntil, replacesId: replacing })
    .onConflictDoNothing()
  const [stored] = await transaction.select({ id: authorizations.id }).from(authorizations).where(eq(authorizations.paypalAuthorizationId, placed.authorizationId))
  if (stored === undefined) throw new Error('The authorization was not stored.')

  if (replacing !== null) {
    await transaction.update(holds).set({ state: 'placed', currentAuthorizationId: stored.id, replacementOrderId: null }).where(eq(holds.id, holdId))
  } else if (!surplus && transition(HOLD_TRANSITIONS, hold.state, 'placed').ok) {
    await transaction.update(holds).set({ state: 'placed', currentAuthorizationId: stored.id }).where(eq(holds.id, holdId))
  }
  const [rental] = await transaction.select({ state: rentals.state }).from(rentals).where(eq(rentals.id, execution.rentalId))
  if (rental !== undefined && transition(RENTAL_TRANSITIONS, rental.state, 'ready').ok) await transaction.update(rentals).set({ state: 'ready' }).where(eq(rentals.id, execution.rentalId))
  await transaction
    .insert(moneyEvents)
    .values({ shopId: execution.shopId, rentalId: execution.rentalId, holdId, kind: 'hold_placed', currency: placed.amount.currency, amountCents: placed.amount.cents, paypalReference: placed.authorizationId, occurredAt: placed.createdAt })
    .onConflictDoNothing()
  await transaction
    .update(executions)
    .set({ state: 'confirmed', attempts: execution.attempts + 1, lastError: null, paypalResourceIds: { ...execution.paypalResourceIds, authorization: placed.authorizationId }, updatedAt: now })
    .where(eq(executions.id, executionId))
  await markExecutionSent(transaction, executionId, now)
  const upkeep = { holdId, authorizationId: stored.id, ...planUpkeep(clocks) }
  if (surplus) {
    await transaction.update(holds).set({ replacementOrderId: null }).where(eq(holds.id, holdId))
    const releaseExecutionId = await beginRelease(transaction, { shopId: execution.shopId, rentalId: execution.rentalId, holdId, authorizationId: stored.id }, now)
    return { ok: true, upkeep, replaced: { authorizationId: stored.id, releaseExecutionId, rentalId: execution.rentalId } }
  }
  if (replacing === null) return { ok: true, upkeep, replaced: undefined }
  const releaseExecutionId = await beginRelease(transaction, { shopId: execution.shopId, rentalId: execution.rentalId, holdId, authorizationId: replacing }, now)
  return { ok: true, upkeep, replaced: { authorizationId: replacing, releaseExecutionId, rentalId: execution.rentalId } }
}

// Records that an authorization a replacement took over from is to be voided, with its outbox message. Its key is fixed
// by the authorization, so it is released once.
async function beginRelease(transaction: Transaction, of: { readonly shopId: string; readonly rentalId: string; readonly holdId: string; readonly authorizationId: string }, now: Date): Promise<string> {
  const [old] = await transaction.select({ paypalId: authorizations.paypalAuthorizationId, amountCents: authorizations.amountCents, currency: authorizations.currency }).from(authorizations).where(eq(authorizations.id, of.authorizationId))
  if (old === undefined) throw new Error('The replaced authorization is missing.')
  const [created] = await transaction
    .insert(executions)
    .values({ shopId: of.shopId, rentalId: of.rentalId, holdId: of.holdId, action: 'release', idempotencyKey: `hold-release-replaced-${of.authorizationId}`, currency: old.currency, amountCents: old.amountCents, paypalResourceIds: { authorization: old.paypalId }, createdAt: now, updatedAt: now })
    .returning({ id: executions.id })
  if (created === undefined) throw new Error('The release was not recorded.')
  await transaction.insert(outbox).values({ shopId: of.shopId, queue: EXECUTIONS_QUEUE, messageGroup: of.rentalId, payload: { executionId: created.id }, createdAt: now })
  return created.id
}
