import { currentTrustLadder, rentalItemHolds, trustConsent, trustMoneyLog, trustOutcomes } from '@hold/db'
import type { Transaction, TrustedHold } from '@hold/db'
import { cleanRecord, DEFAULT_WINDOW_MONTHS, neverTaken, rentalHoldFor } from '@hold/domain'
import type { CleanRecord, NeverTaken } from '@hold/domain'

// A renter's Clean Record as Hold reads it inside, and the hold a shop's ladder gives them (extensions.md section 7).
// The record is counted by plain code in @hold/domain; this joins it to the rows the database lets the caller see.

// The hold the shop's current ladder gives the renter the key names, for a staff member asking for it at pickup. The
// shop's own history always counts; another shop's only when the shop chose the network and the renter consented,
// which the database also enforces. Nothing when the ordinary hold applies: no key, no ladder, or no reduction.
export async function trustedHold(transaction: Transaction, rentalId: string, renterKey: string | undefined, now: Date): Promise<TrustedHold | undefined> {
  if (renterKey === undefined) return undefined
  const published = await currentTrustLadder(transaction)
  if (published === undefined) return undefined
  const { ladder } = published
  const outcomes = await trustOutcomes(transaction, renterKey)
  const network = ladder.history === 'network' && (await trustConsent(transaction, renterKey))?.consented === true
  const record = cleanRecord(network ? outcomes : outcomes.filter((outcome) => outcome.here), ladder.windowMonths, now)
  const items = await rentalItemHolds(transaction, rentalId)
  if (items.length === 0 || items.some((item) => item.hold.currency !== ladder.currency)) return undefined
  const hold = rentalHoldFor(items, ladder, record)
  if (hold.amount.cents >= hold.ordinary.cents) return undefined
  return { reservedCents: hold.amount.cents, ordinaryCents: hold.ordinary.cents, ladderId: published.id, rung: hold.rung, cleanReturns: record.clean }
}

export type RenterRecord = { readonly record: CleanRecord; readonly neverTaken: readonly NeverTaken[]; readonly consent: { readonly answered: boolean; readonly consented: boolean } }

// The renter's own record, for their link: every shop's outcomes, counted over the usual window, and the deposits
// never taken from them, read from the money log. Only a transaction for the renter's link sees all of it.
export async function renterRecord(transaction: Transaction, renterKey: string, now: Date): Promise<RenterRecord> {
  const outcomes = await trustOutcomes(transaction, renterKey)
  const consent = (await trustConsent(transaction, renterKey)) ?? { answered: false, consented: false }
  return { record: cleanRecord(outcomes, DEFAULT_WINDOW_MONTHS, now), neverTaken: neverTaken(await trustMoneyLog(transaction, renterKey)), consent }
}
