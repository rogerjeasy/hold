import { runClaimDeadline } from './claim-deadline.ts'
import { expireHold, saveReplacementOrder, upkeepTarget } from '@hold/db'
import type { UpkeepTarget } from '@hold/db'
import { money, needsReplacement } from '@hold/domain'
import { PayPalUnavailable, TRANSIENT } from './dependencies.ts'
import type { SettleDependencies } from './dependencies.ts'
import { inWorkerShop } from './execution-queue.ts'
import { shopPayPal } from './shop-paypal.ts'
import type { PayPalHolds } from '@hold/paypal'
import { scheduleStep } from './upkeep-schedules.ts'
import type { UpkeepMessage } from './queue-messages.ts'

// The timed steps that keep a placed hold watched (architecture.md section 7.4), each sent by its schedule. Hold acts on
// its own clock and confirms with PayPal: PayPal sends no event when a hold expires.

export type UpkeepOutcome = 'expired' | 'still_valid' | 'replacement_asked' | 'nothing_to_do' | 'claim_scheduled' | 'claim_charging'

// PayPal still holds the money on an authorization in these states until its end.
const STILL_HELD: ReadonlySet<string> = new Set(['created', 'partially_captured', 'pending'])

export async function runUpkeep(dependencies: SettleDependencies, message: UpkeepMessage): Promise<UpkeepOutcome> {
  if ('claimId' in message) return runClaimDeadline(dependencies, message)
  const { shopId, holdId, authorizationId } = message
  const { target, account } = await inWorkerShop(dependencies, shopId, async (transaction) => ({
    target: await upkeepTarget(transaction, holdId, authorizationId),
    account: await shopPayPal(dependencies, transaction, shopId),
  }))
  // A replacement took the hold onto another authorization, which has schedules of its own.
  if (target === undefined || !target.current) return 'nothing_to_do'
  const tellExpired = async () => {
    await dependencies.notifier.tell({ kind: 'hold_expired', shopId, rentalId: target.rentalId })
    return 'expired' as const
  }
  // Telling the owners failed on an earlier try, after the hold was marked expired.
  if (target.holdState === 'expired') return tellExpired()
  if (target.holdState !== 'placed' && target.holdState !== 'at_risk') return 'nothing_to_do'
  if (account === undefined) throw new PayPalUnavailable('no_account')
  if (message.kind === 'replace') return askForReplacement(dependencies, message, target, account.paypal)

  const read = await account.paypal.readAuthorization(target.paypalAuthorizationId)
  if (!read.ok && read.error.kind !== 'not_found') throw new PayPalUnavailable(TRANSIENT.has(read.error.kind) ? read.error.kind : 'unexpected_response')
  const now = dependencies.now()
  if (read.ok && STILL_HELD.has(read.value.status) && read.value.expiresAt > now) {
    // The schedule fired before PayPal's own end. Look again then.
    await scheduleStep(dependencies, shopId, { holdId, authorizationId }, 'expire', read.value.expiresAt)
    return 'still_valid'
  }
  // Captured or voided: another step settled this hold, and its own record says so.
  if (read.ok && !STILL_HELD.has(read.value.status) && read.value.status !== 'expired') return 'nothing_to_do'
  const expired = await inWorkerShop(dependencies, shopId, (transaction) => expireHold(transaction, holdId, authorizationId, now))
  return expired.ok ? tellExpired() : 'nothing_to_do'
}

// Three days before the hold's end, while the rental still needs it: a new hold for the same amount, which the renter
// approves from a link, as at pickup. Once approved, the hold moves onto it and the old one is released. A saved
// payment method would need no approval, but PayPal must first allow the shop to keep one (tech-stack.md section 16).
async function askForReplacement(dependencies: SettleDependencies, message: Extract<UpkeepMessage, { holdId: string }>, target: UpkeepTarget, paypal: PayPalHolds): Promise<UpkeepOutcome> {
  const { shopId, holdId, authorizationId } = message
  if (!needsReplacement(target.rentalState)) return 'nothing_to_do'
  const approval = await dependencies.renterAsk.approval(shopId, target.rentalId)
  // Keyed by the authorization being replaced, so asking again makes no second order.
  const created = await paypal.createHoldOrder({
    amount: money(target.reservedCents, target.currency),
    rentalReference: target.rentalId,
    description: approval.orderDescription.slice(0, 127),
    returnUrl: approval.url,
    cancelUrl: approval.url,
    idempotencyKey: `hold-replacement-order-${authorizationId}`,
  })
  if (!created.ok) throw new PayPalUnavailable(created.error.kind)
  const saved = await inWorkerShop(dependencies, shopId, (transaction) => saveReplacementOrder(transaction, holdId, authorizationId, created.value.orderId))
  if (!saved.ok) return 'nothing_to_do'
  await dependencies.notifier.tell({ kind: 'hold_replacement', shopId, rentalId: target.rentalId, approveUrl: approval.url, holdEndsAt: target.validUntil })
  return 'replacement_asked'
}
