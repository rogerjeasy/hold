import { captureSession, inShop, recordPhoto, rentalDetail, rentalItemFor, sealSession, startCaptureSession } from '@hold/db'
import { randomUUID } from 'node:crypto'
import * as actions from '@/features/claims/actions'
import * as renter from '@/features/claims/renter-actions'
import { getServices } from '@/server/services'
import type { HandoverShop } from './ready-rental'
import { form, signIn } from './shop-session'

// For tests of what follows a return: a rental with handover and return photographs sealed, and one with a claim the
// owner approved and the renter has seen on their claim link. Each test file mocks next/headers onto its cookie jar.

export async function inspectedRental(jar: Map<string, string>, shop: HandoverShop) {
  return inspectedRentalOf(jar, shop, await shop.readyRental())
}

// The same, for a rental the test made ready itself.
export async function inspectedRentalOf(jar: Map<string, string>, shop: HandoverShop, rental: { readonly rentalId: string; readonly token: string }) {
  const { database } = await getServices()
  const scoped = <Result>(work: Parameters<typeof inShop<Result>>[2]) => inShop(database, { role: 'hold_app', shopId: shop.shopId }, work)
  const item = (await scoped((transaction) => rentalDetail(transaction, rental.rentalId, new Date())))?.items[0]?.id ?? ''
  const rentalItemId = await scoped((transaction) => rentalItemFor(transaction, rental.rentalId, item))
  for (const kind of ['handover', 'return'] as const) {
    const session = await scoped((transaction) => startCaptureSession(transaction, { rentalId: rental.rentalId, rentalItemId: rentalItemId ?? '', kind, actorUserId: null }, new Date()))
    if (!session.ok) throw new Error(session.reason)
    const capture = await scoped((transaction) => captureSession(transaction, session.sessionId))
    for (const view of capture?.plan.filter((each) => each.required) ?? []) await scoped((transaction) => recordPhoto(transaction, session.sessionId, { view: view.key, evidenceKey: randomUUID(), sha256: 'a'.repeat(64), quality: { sharpness: 120, shadows: 20, highlights: 220, filled: .6 } }, new Date()))
    await scoped((transaction) => sealSession(transaction, session.sessionId, new Date()))
  }
  await signIn(jar, shop.owner, 'passkey')
  return rental
}

export async function presentedClaim(jar: Map<string, string>, shop: HandoverShop, priceId: string) {
  return presentedClaimOf(jar, shop, await shop.readyRental(), priceId)
}

export async function presentedClaimOf(jar: Map<string, string>, shop: HandoverShop, ready: { readonly rentalId: string; readonly token: string }, priceId: string) {
  const rental = await inspectedRentalOf(jar, shop, ready)
  const created = await actions.prepareClaim(null, form({ rentalId: rental.rentalId, lines: JSON.stringify([{ priceEntryId: priceId, reason: 'Inspected the returned frame in person: fresh scratch.' }]), locale: 'en' }))
  if (!created.ok) throw new Error(JSON.stringify(created))
  const approved = await actions.approveAndPresent(null, form({ claimId: created.value.claimId, locale: 'en' }))
  if (!approved.ok) throw new Error(JSON.stringify(approved))
  const claimToken = approved.value.url.split('/r/')[1]?.split('/')[0] ?? ''
  const seen = await renter.acknowledgeClaim(null, form({ token: claimToken, locale: 'en' }))
  if (!seen.ok) throw new Error(JSON.stringify(seen))
  return { ...rental, claimId: created.value.claimId, claimToken }
}
