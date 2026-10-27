import { randomUUID } from 'node:crypto'
import { money } from '@hold/domain'
import { captureSession, recordPhoto, sealSession, startCaptureSession } from '../capture-repository.ts'
import { approveClaim, draftClaim, presentClaim } from '../claim-repository.ts'
import { publishPriceList } from '../price-list-repository.ts'
import { priceEntries } from '../schema/index.ts'
import type { ReadyRentalShop } from './ready-rental.ts'

// For the negotiation tests: a shop whose price list has two entries at 35.00, and a returned rental with a presented
// claim of two lines named by a person, 70.00 against a hold of 300.00. The wear policy has one clause, wear-1.
export async function twoLinePrices(shop: ReadyRentalShop, now: Date) {
  await shop.act((transaction) => publishPriceList(transaction, shop.scope.shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries: [{ description: 'Scratch', category: 'damage', amount: money(35_00, 'EUR') }, { description: 'Fork scratch', category: 'damage', amount: money(35_00, 'EUR') }], wearPolicy: 'Scuffs are wear.' }, now))
  const entries = await shop.act((transaction) => transaction.select().from(priceEntries))
  const fork = entries.find((entry) => entry.description === 'Fork scratch')
  return { scratch: entries.find((entry) => entry.description === 'Scratch' && entry.priceListId === fork?.priceListId)?.id ?? '', fork: fork?.id ?? '' }
}

export async function presentedClaim(shop: ReadyRentalShop, prices: { readonly scratch: string; readonly fork: string }, raisedBy: string, now: Date) {
  const rental = await shop.readyRental()
  const owner = shop.scope.userId ?? ''
  for (const kind of ['handover', 'return'] as const) {
    const started = await shop.act((transaction) => startCaptureSession(transaction, { rentalId: rental.rentalId, rentalItemId: rental.rentalItemIds[0] ?? '', kind, actorUserId: owner }, now))
    if (!started.ok) throw new Error(started.reason)
    const session = await shop.act((transaction) => captureSession(transaction, started.sessionId))
    for (const view of session?.plan.filter((each) => each.required) ?? []) await shop.act((transaction) => recordPhoto(transaction, started.sessionId, { view: view.key, evidenceKey: randomUUID(), sha256: 'a'.repeat(64), quality: { sharpness: 120, shadows: 20, highlights: 220, filled: .6 } }, now))
    await shop.act((transaction) => sealSession(transaction, started.sessionId, now))
  }
  const draft = await shop.act((transaction) => draftClaim(transaction, rental.rentalId, raisedBy, [{ priceEntryId: prices.scratch, reason: 'Scratch on the frame.' }, { priceEntryId: prices.fork, reason: 'Scratch on the fork.' }], now))
  if (!draft.ok) throw new Error(draft.reason)
  const approved = await shop.act((transaction) => approveClaim(transaction, draft.claimId, owner, now))
  if (!approved.ok) throw new Error(approved.reason)
  await shop.act((transaction) => presentClaim(transaction, draft.claimId, owner, now))
  return { rentalId: rental.rentalId, claimId: draft.claimId }
}
