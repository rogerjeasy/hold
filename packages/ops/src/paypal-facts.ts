import { holdsToReconcile, inShop, rentalsForCaptures } from '@hold/db'
import type { Database } from '@hold/db'
import type { ShopSnapshot } from '@hold/domain'
import type { AuthorizationStatus, OpenDispute } from '@hold/paypal'
import type { OpenedReader } from './paypal-reader.ts'

// What a run reads from the shop's PayPal account by code: open disputes, each hold's authorization as PayPal has
// it, and the MCP reader for the model. Undefined in any part means PayPal could not be reached for it.
export type ShopPayPalReads = {
  readonly disputes: () => Promise<readonly OpenDispute[] | undefined>
  readonly authorization: (paypalAuthorizationId: string) => Promise<AuthorizationStatus | undefined>
  readonly openReader: () => Promise<OpenedReader>
}

// A hold Hold still counts as reserved that PayPal has already ended. A walk-in hold is placed with the fee and the
// fee is captured from it at once, so PayPal reads it as partly captured for its whole life: that is no difference.
const ENDED: readonly AuthorizationStatus[] = ['voided', 'captured', 'partially_captured', 'expired', 'denied']
const ended = (hold: { readonly strategy: string }, status: AuthorizationStatus) => ENDED.includes(status) && !(hold.strategy === 'combined' && status === 'partially_captured')

export async function paypalFacts(database: Database, shopId: string, reads: ShopPayPalReads | undefined): Promise<Pick<ShopSnapshot, 'disputes' | 'differences'> & { readonly reached: boolean }> {
  if (reads === undefined) return { disputes: [], differences: [], reached: false }
  const asWorker = <Result>(work: Parameters<typeof inShop<Result>>[2]) => inShop(database, { role: 'hold_worker', shopId }, work)
  const open = await reads.disputes().catch(() => undefined)
  const rentalOf = await asWorker((transaction) => rentalsForCaptures(transaction, (open ?? []).flatMap((dispute) => dispute.captureIds)))
  const disputes = (open ?? []).map((dispute) => ({
    id: dispute.id,
    rentalId: dispute.captureIds.map((captureId) => rentalOf[captureId]).find((rentalId) => rentalId !== undefined) ?? null,
    state: dispute.open ? 'open' : 'closed',
    amountCents: dispute.amount?.cents ?? 0,
    responseDueAt: dispute.responseDueAt,
    respondedAt: null,
  }))
  const differences = []
  for (const hold of await asWorker((transaction) => holdsToReconcile(transaction))) {
    const status = await reads.authorization(hold.authorizationId).catch(() => undefined)
    if (status !== undefined && ended(hold, status)) differences.push({ id: `${hold.holdId}:${status}`, subjectKind: 'hold', subjectId: hold.holdId, rentalId: hold.rentalId })
  }
  return { disputes, differences, reached: open !== undefined }
}
