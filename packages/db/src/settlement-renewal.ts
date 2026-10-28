import { authorizationClocks, HOLD_TRANSITIONS, keepsOriginalEnd, transition } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { EXECUTIONS_QUEUE, markExecutionSent } from './fee-repository.ts'
import { settlementWork } from './settlement-repository.ts'
import { authorizations, executions, holds, moneyEvents, outbox } from './schema/index.ts'
import type { Transaction } from './scope.ts'
import type { PlacedAuthorization } from './hold-repository.ts'

export async function beginSettlementRenewal(transaction: Transaction, captureExecutionId: string, now: Date) {
  const work = await settlementWork(transaction, captureExecutionId)
  if (work?.claim?.state !== 'charging' || work.authorization.renewedFromId !== null) return undefined
  const idempotencyKey = `claim-renew-${work.authorization.id}`
  const [existing] = await transaction.select().from(executions).where(eq(executions.idempotencyKey, idempotencyKey))
  if (existing !== undefined) return existing.id
  if (work.hold.state !== 'renewing' && !transition(HOLD_TRANSITIONS, work.hold.state, 'renewing').ok) return undefined
  const [created] = await transaction.insert(executions).values({ shopId: work.hold.shopId, rentalId: work.hold.rentalId, holdId: work.hold.id, action: 'renew', idempotencyKey, currency: work.hold.currency, amountCents: work.hold.reservedCents, paypalResourceIds: { authorization: work.authorization.paypalAuthorizationId, captureExecution: captureExecutionId }, createdAt: now, updatedAt: now }).returning()
  if (created === undefined) throw new Error('No renewal was queued.')
  await transaction.insert(outbox).values({ shopId: work.hold.shopId, queue: EXECUTIONS_QUEUE, messageGroup: work.hold.rentalId, payload: { executionId: created.id }, createdAt: now })
  await transaction.update(holds).set({ state: 'renewing' }).where(eq(holds.id, work.hold.id))
  return created.id
}

export async function confirmSettlementRenewal(transaction: Transaction, executionId: string, read: PlacedAuthorization, now: Date) {
  const work = await settlementWork(transaction, executionId)
  if (work === undefined || work.execution.action !== 'renew') return false
  if (work.execution.state === 'confirmed') return true
  const captureId = work.execution.paypalResourceIds['captureExecution']
  if (captureId === undefined || read.status !== 'created' || read.amount.cents !== work.authorization.amountCents || read.amount.currency !== work.authorization.currency || read.authorizationId === work.authorization.paypalAuthorizationId || !keepsOriginalEnd(work.authorization.validUntil, read.expiresAt) || read.expiresAt <= now || !transition(HOLD_TRANSITIONS, work.hold.state, 'placed').ok) return false
  const clocks = authorizationClocks(read, true)
  await transaction.insert(authorizations).values({ shopId: work.hold.shopId, holdId: work.hold.id, paypalAuthorizationId: read.authorizationId, currency: read.amount.currency, amountCents: read.amount.cents, createdAt: read.createdAt, assuredUntil: clocks.assuredUntil, validUntil: clocks.validUntil, renewedFromId: work.authorization.id }).onConflictDoNothing()
  const [renewed] = await transaction.select().from(authorizations).where(eq(authorizations.paypalAuthorizationId, read.authorizationId))
  const [capture] = await transaction.select().from(executions).where(eq(executions.id, captureId))
  if (renewed === undefined || capture === undefined || renewed.holdId !== work.hold.id) return false
  await transaction.update(authorizations).set({ state: 'renewed' }).where(eq(authorizations.id, work.authorization.id))
  await transaction.update(holds).set({ state: 'placed', currentAuthorizationId: renewed.id }).where(eq(holds.id, work.hold.id))
  if (!transition(HOLD_TRANSITIONS, 'placed', 'capturing').ok) throw new Error('A renewed hold cannot be captured.')
  await transaction.update(holds).set({ state: 'capturing' }).where(eq(holds.id, work.hold.id))
  await transaction.update(executions).set({ paypalResourceIds: { ...capture.paypalResourceIds, authorization: read.authorizationId }, updatedAt: now }).where(eq(executions.id, capture.id))
  await transaction.update(executions).set({ state: 'confirmed', lastError: null, updatedAt: now }).where(eq(executions.id, executionId))
  await transaction.insert(moneyEvents).values({ shopId: work.hold.shopId, rentalId: work.hold.rentalId, holdId: work.hold.id, kind: 'hold_renewed', currency: read.amount.currency, amountCents: read.amount.cents, paypalReference: read.authorizationId, occurredAt: read.createdAt }).onConflictDoNothing()
  await markExecutionSent(transaction, executionId, now)
  return true
}

export async function failSettlementRenewal(transaction: Transaction, executionId: string, reason: string, now: Date) {
  const work = await settlementWork(transaction, executionId)
  if (work === undefined || work.execution.state === 'confirmed') return
  if (transition(HOLD_TRANSITIONS, work.hold.state, 'at_risk').ok) {
    await transaction.update(holds).set({ state: 'at_risk' }).where(eq(holds.id, work.hold.id))
    if (transition(HOLD_TRANSITIONS, 'at_risk', 'capturing').ok) await transaction.update(holds).set({ state: 'capturing' }).where(eq(holds.id, work.hold.id))
  }
  await transaction.update(executions).set({ state: 'failed', lastError: reason, updatedAt: now }).where(eq(executions.id, executionId))
  await markExecutionSent(transaction, executionId, now)
}
