import { HOLD_TRANSITIONS, planUpkeep, transition } from '@hold/domain'
import type { HoldState, RentalState } from '@hold/domain'
import { and, eq, inArray } from 'drizzle-orm'
import { closeSettledRental } from './settlement-repository.ts'
import { markExecutionSent } from './fee-repository.ts'
import type { HoldUpkeep } from './hold-repository.ts'
import { auditLog, authorizations, executions, holds, moneyEvents, rentals, staffRoles, users } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// Keeping a placed hold useful until its rental no longer needs it (architecture.md section 7.4): the schedules it
// needs, what each scheduled step acts on, a replacement before it ends, the release of the hold a replacement took
// over from, and marking it expired when nothing replaced it.

// The schedules a hold still needs, for the authorization it rests on now. Nothing for a hold not placed, or one
// already released, captured or expired.
export async function holdUpkeep(transaction: Transaction, holdId: string): Promise<HoldUpkeep | undefined> {
  const [row] = await transaction
    .select({ authorizationId: authorizations.id, validUntil: authorizations.validUntil })
    .from(holds)
    .innerJoin(authorizations, eq(authorizations.id, holds.currentAuthorizationId))
    .where(and(eq(holds.id, holdId), inArray(holds.state, ['placed', 'at_risk'])))
  return row === undefined ? undefined : { holdId, authorizationId: row.authorizationId, ...planUpkeep(row) }
}

export type UpkeepTarget = {
  readonly rentalId: string
  readonly rentalState: RentalState
  readonly holdState: HoldState
  // False once a replacement took the hold onto another authorization: the step then has nothing to do.
  readonly current: boolean
  readonly paypalAuthorizationId: string
  readonly validUntil: Date
  readonly reservedCents: number
  readonly currency: string
}

// What a scheduled upkeep step acts on: the hold, its rental, and the authorization the step was made for.
export async function upkeepTarget(transaction: Transaction, holdId: string, authorizationId: string): Promise<UpkeepTarget | undefined> {
  const [row] = await transaction
    .select({
      rentalId: holds.rentalId,
      rentalState: rentals.state,
      holdState: holds.state,
      currentAuthorizationId: holds.currentAuthorizationId,
      paypalAuthorizationId: authorizations.paypalAuthorizationId,
      validUntil: authorizations.validUntil,
      reservedCents: holds.reservedCents,
      currency: holds.currency,
    })
    .from(holds)
    .innerJoin(rentals, eq(rentals.id, holds.rentalId))
    .innerJoin(authorizations, and(eq(authorizations.holdId, holds.id), eq(authorizations.id, authorizationId)))
    .where(eq(holds.id, holdId))
  if (row === undefined) return undefined
  const { currentAuthorizationId, ...target } = row
  return { ...target, current: currentAuthorizationId === authorizationId }
}

export type ExpireResult = { readonly ok: true; readonly rentalId: string } | { readonly ok: false; readonly reason: 'not_found' | 'not_current' | 'not_placed' }

// The hold reached the end of its validity with nothing replacing it (architecture.md section 7.4). It is marked
// expired once PayPal confirms it, and the audit trail says so.
export async function expireHold(transaction: Transaction, holdId: string, authorizationId: string, now: Date): Promise<ExpireResult> {
  const [hold] = await transaction.select({ shopId: holds.shopId, rentalId: holds.rentalId, state: holds.state, current: holds.currentAuthorizationId }).from(holds).where(eq(holds.id, holdId)).for('update')
  if (hold === undefined) return { ok: false, reason: 'not_found' }
  if (hold.current !== authorizationId) return { ok: false, reason: 'not_current' }
  if (!transition(HOLD_TRANSITIONS, hold.state, 'expired').ok) return { ok: false, reason: 'not_placed' }
  await transaction.update(holds).set({ state: 'expired' }).where(eq(holds.id, holdId))
  await transaction.update(authorizations).set({ state: 'expired' }).where(eq(authorizations.id, authorizationId))
  await transaction.insert(auditLog).values({ shopId: hold.shopId, actorKind: 'system', action: 'hold.expired', subjectKind: 'hold', subjectId: holdId, detail: { rentalId: hold.rentalId }, at: now })
  return { ok: true, rentalId: hold.rentalId }
}

export type ShopOwner = { readonly email: string; readonly name: string | null; readonly language: string }

// The people told at once when a hold needs them, such as one that expired.
export function shopOwners(transaction: Transaction): Promise<ShopOwner[]> {
  return transaction
    .select({ email: users.email, name: users.name, language: users.language })
    .from(staffRoles)
    .innerJoin(users, eq(users.id, staffRoles.userId))
    .where(eq(staffRoles.role, 'owner'))
}

export type ReplacementResult = { readonly ok: true } | { readonly ok: false; readonly reason: 'not_found' | 'not_current' | 'not_placed' }

// Keeps the order of the replacement the renter is asked to approve. Only on the authorization the hold rests on, so
// a step scheduled for an authorization already replaced asks for nothing.
export async function saveReplacementOrder(transaction: Transaction, holdId: string, authorizationId: string, orderId: string): Promise<ReplacementResult> {
  const [hold] = await transaction.select({ state: holds.state, current: holds.currentAuthorizationId }).from(holds).where(eq(holds.id, holdId)).for('update')
  if (hold === undefined) return { ok: false, reason: 'not_found' }
  if (hold.current !== authorizationId) return { ok: false, reason: 'not_current' }
  if (hold.state !== 'placed' && hold.state !== 'at_risk') return { ok: false, reason: 'not_placed' }
  await transaction.update(holds).set({ replacementOrderId: orderId }).where(eq(holds.id, holdId))
  return { ok: true }
}

export type ReleasedResult = { readonly ok: true } | { readonly ok: false; readonly reason: 'not_found' | 'not_voided' }

// Applies what PayPal read back for an authorization a replacement took over from: once PayPal shows it voided, it is
// marked so, and the money log records what is no longer held. Applying it again changes nothing.
export async function confirmAuthorizationReleased(transaction: Transaction, executionId: string, readBack: { readonly status: string }, now: Date): Promise<ReleasedResult> {
  const [execution] = await transaction.select().from(executions).where(eq(executions.id, executionId)).for('update')
  const paypalId = execution?.paypalResourceIds['authorization']
  if (execution === undefined || execution.action !== 'release' || paypalId === undefined) return { ok: false, reason: 'not_found' }
  if (execution.state === 'confirmed') return { ok: true }
  if (readBack.status !== 'voided') {
    await transaction.update(executions).set({ state: 'failed', attempts: execution.attempts + 1, lastError: `PayPal shows the authorization as ${readBack.status}.`, updatedAt: now }).where(eq(executions.id, executionId))
    return { ok: false, reason: 'not_voided' }
  }
  const [released] = await transaction
    .update(authorizations)
    .set({ state: 'voided' })
    .where(eq(authorizations.paypalAuthorizationId, paypalId))
    .returning({ amountCents: authorizations.amountCents, currency: authorizations.currency })
  if (released === undefined) return { ok: false, reason: 'not_found' }
  await transaction
    .insert(moneyEvents)
    .values({ shopId: execution.shopId, rentalId: execution.rentalId, holdId: execution.holdId, kind: 'hold_released', currency: released.currency, amountCents: released.amountCents, paypalReference: `${paypalId}:voided`, occurredAt: now })
    .onConflictDoNothing()
  await transaction.update(executions).set({ state: 'confirmed', attempts: execution.attempts + 1, lastError: null, updatedAt: now }).where(eq(executions.id, executionId))
  await markExecutionSent(transaction, executionId, now)
  if (execution.holdId !== null) {
    const [hold] = await transaction.select().from(holds).where(eq(holds.id, execution.holdId))
    if (hold !== undefined) await closeSettledRental(transaction, execution.rentalId, hold.state, now)
  }
  return { ok: true }
}
