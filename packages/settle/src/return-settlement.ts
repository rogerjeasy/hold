import { CAPTURE_DECLINED_ONCE, noteCaptureDeclined, queueSettlementReceipts, resolveClaimSettlement, mayExecuteSettlement, beginClaimInvoice, beginSettlementRenewal, findExecution, confirmClaimCaptured, confirmReturnReleased, failExecution, saveSettlementResource, settlementWork } from '@hold/db'
import type { StoredExecution } from '@hold/db'
import { money, planCharge } from '@hold/domain'
import type { PayPalHolds } from '@hold/paypal'
import { PayPalUnavailable, TRANSIENT } from './dependencies.ts'
import type { SettleDependencies } from './dependencies.ts'
import { runExecution } from './executions.ts'
import { renewForSettlement } from './settlement-renewal.ts'
import { inWorkerShop } from './execution-queue.ts'
import type { ExecutionOutcome } from './execution-queue.ts'

export async function settleReturn(dependencies: SettleDependencies, shopId: string, execution: StoredExecution, paypal: PayPalHolds): Promise<ExecutionOutcome> {
  if (!await inWorkerShop(dependencies, shopId, (transaction) => mayExecuteSettlement(transaction, execution.id))) {
    await inWorkerShop(dependencies, shopId, (transaction) => failExecution(transaction, execution.id, 'approval_mismatch', dependencies.now()))
    return 'failed'
  }
  let work = await inWorkerShop(dependencies, shopId, (transaction) => settlementWork(transaction, execution.id))
  if (work === undefined) return 'nothing_to_do'
  if (execution.action === 'capture' && work.execution.paypalResourceIds['capture'] === undefined && planCharge({ assuredUntil: work.authorization.assuredUntil, validUntil: work.authorization.validUntil, isRenewal: work.authorization.renewedFromId !== null }, dependencies.now()).kind === 'renew_then_capture') {
    const renewalId = await inWorkerShop(dependencies, shopId, (transaction) => beginSettlementRenewal(transaction, execution.id, dependencies.now()))
    const renewal = renewalId === undefined ? undefined : await inWorkerShop(dependencies, shopId, (transaction) => findExecution(transaction, renewalId))
    if (renewal === undefined) return 'waiting'
    await renewForSettlement(dependencies, shopId, renewal, paypal)
    // A failed renewal still permits a capture on the original authorization. A successful one replaces its ID.
    const updated = await inWorkerShop(dependencies, shopId, (transaction) => settlementWork(transaction, execution.id))
    if (updated !== undefined) work = updated
  }
  const failedCapture = async (reason: string): Promise<ExecutionOutcome> => {
    const nextId = await inWorkerShop(dependencies, shopId, async (transaction) => {
      const invoiceId = await beginClaimInvoice(transaction, execution.id, true, reason, dependencies.now())
      return invoiceId ?? (work.claim === undefined ? undefined : await resolveClaimSettlement(transaction, work.claim.id, dependencies.now()))
    })
    return nextId === undefined ? 'failed' : runExecution(dependencies, { shopId, executionId: nextId })
  }
  if (execution.action === 'capture' && work.execution.paypalResourceIds['capture'] === undefined && planCharge({ assuredUntil: work.authorization.assuredUntil, validUntil: work.authorization.validUntil, isRenewal: work.authorization.renewedFromId !== null }, dependencies.now()).kind === 'expired') return failedCapture('hold_expired')
  const resources = work.execution.paypalResourceIds
  const authorizationId = resources['authorization']
  if (authorizationId === undefined) return 'failed'
  if (execution.action === 'release') {
    const released = await paypal.releaseHold({ authorizationId, idempotencyKey: execution.idempotencyKey })
    if (!released.ok && TRANSIENT.has(released.error.kind)) throw new PayPalUnavailable(released.error.kind)
    const read = await paypal.readAuthorization(authorizationId)
    if (!read.ok) throw new PayPalUnavailable(read.error.kind)
    return await inWorkerShop(dependencies, shopId, (transaction) => confirmReturnReleased(transaction, execution.id, read.value, dependencies.now())) ? 'confirmed' : 'waiting'
  }
  if (work.claim?.state !== 'charging' || work.execution.amountCents === null || work.execution.currency === null) return 'nothing_to_do'
  let captureId = resources['capture']
  if (captureId === undefined) {
    // A decline can pass: a capture after the authorization's assured period, when its renewal failed, is not promised
    // the funds. So the first decline waits for the recheck to try once more, and only the second goes to the invoice.
    // PayPal answers a repeated PayPal-Request-Id with its first answer, so the second try has a key of its own, as
    // fixed as the first, and a repeat of it captures nothing twice.
    const triedAgain = work.execution.lastError === CAPTURE_DECLINED_ONCE
    const captured = await paypal.captureFromHold({ authorizationId, amount: money(work.execution.amountCents, work.execution.currency), finalCapture: true, idempotencyKey: triedAgain ? `${execution.idempotencyKey}-again` : execution.idempotencyKey })
    if (!captured.ok) {
      if (TRANSIENT.has(captured.error.kind)) throw new PayPalUnavailable(captured.error.kind)
      if (captured.error.kind === 'declined' && !triedAgain) {
        await inWorkerShop(dependencies, shopId, (transaction) => noteCaptureDeclined(transaction, execution.id, dependencies.now()))
        return 'waiting'
      }
      if (['declined', 'hold_expired', 'hold_voided'].includes(captured.error.kind)) {
        return failedCapture(captured.error.kind)
      }
      await inWorkerShop(dependencies, shopId, (transaction) => failExecution(transaction, execution.id, captured.error.kind, dependencies.now()))
      return 'failed'
    }
    const storedCaptureId = captured.value.captureId
    captureId = storedCaptureId
    await inWorkerShop(dependencies, shopId, (transaction) => saveSettlementResource(transaction, execution.id, 'capture', storedCaptureId, dependencies.now()))
  }
  const [capture, authorization] = await Promise.all([paypal.readCapture(captureId), paypal.readAuthorization(authorizationId)])
  if (!capture.ok || !authorization.ok) throw new PayPalUnavailable(!capture.ok ? capture.error.kind : !authorization.ok ? authorization.error.kind : 'unavailable')
  if (['declined', 'failed'].includes(capture.value.status) && capture.value.captureId === captureId && capture.value.authorizationId === authorizationId && capture.value.amount.cents === work.execution.amountCents && capture.value.amount.currency === work.execution.currency) return failedCapture('declined')
  const result = await inWorkerShop(dependencies, shopId, async (transaction) => {
    const confirmed = await confirmClaimCaptured(transaction, execution.id, capture.value, authorization.value, dependencies.now())
    const nextId = confirmed && work.claim !== undefined ? await resolveClaimSettlement(transaction, work.claim.id, dependencies.now()) : undefined
    if (confirmed) await queueSettlementReceipts(transaction, work.execution.rentalId, dependencies.now(), [capture.value.captureId, `${authorization.value.authorizationId}:remainder`])
    return { confirmed, nextId }
  })
  if (!result.confirmed) return 'waiting'
  if (result.nextId !== undefined) await runExecution(dependencies, { shopId, executionId: result.nextId })
  return 'confirmed'
}
