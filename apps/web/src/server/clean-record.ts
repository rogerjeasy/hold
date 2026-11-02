import 'server-only'
import { inShop, rentalRenterKey, renterView } from '@hold/db'
import { DEFAULT_WINDOW_MONTHS } from '@hold/domain'
import { CREDENTIAL_MINUTES, issueCredential, renterRecord } from '@hold/trust'
import type { PublicJwk, RenterRecord } from '@hold/trust'
import { qrSvg } from './qr'
import { renterAccess } from './renter-access'
import { verifyUrl } from './verify-url'
import { getServices } from './services'

// The renter's Clean Record through their link (extensions.md section 7.6): the counts, the deposits never taken, their
// consent, and a fresh credential with a QR code of the page that checks it. Opening the page changes nothing.

export type CleanRecordCredential = { readonly token: string; readonly url: string; readonly qr: string; readonly expiresAt: Date }

export type CleanRecordView = {
  readonly shopName: string
  readonly timeZone: string
  // Absent until PayPal has said who paid the fee. Empty for a renter with no outcome yet.
  readonly own: RenterRecord | undefined
  // Absent when the record could not be signed just now. The counts still show.
  readonly credential: CleanRecordCredential | undefined
}

export type CleanRecordPage = { readonly ok: true; readonly view: CleanRecordView } | { readonly ok: false; readonly failure: 'link_invalid' | 'scope' | 'rate_limited' }

async function credentialFor(renterKey: string, own: RenterRecord, locale: string, now: Date): Promise<CleanRecordCredential | undefined> {
  const { trust, config } = await getServices()
  try {
    const token = await issueCredential(await trust.signer(), renterKey, own.record, now)
    const url = verifyUrl(config.publicUrl, locale, token)
    return { token, url, qr: await qrSvg(url), expiresAt: new Date(now.getTime() + CREDENTIAL_MINUTES * 60_000) }
  } catch {
    // The signing key could not be reached. The renter still sees their counts, and is told to try again.
    return undefined
  }
}

const NOTHING_YET: RenterRecord = { record: { clean: 0, settled: 0, unpaid: 0, open: 0, shops: 0, windowMonths: DEFAULT_WINDOW_MONTHS }, neverTaken: [], consent: { answered: false, consented: false } }

export async function cleanRecordPage(token: string, locale: string): Promise<CleanRecordPage> {
  const now = new Date()
  const access = await renterAccess(token, 'view', now)
  if (!access.ok) return access
  const { database } = await getServices()
  const { rentalId, shopId } = access.link
  const loaded = await inShop(database, { role: 'hold_app', shopId }, async (transaction) => {
    const view = await renterView(transaction, rentalId, now)
    const { known, key } = await rentalRenterKey(transaction, rentalId)
    // A renter whose key is not kept yet has rented nowhere that wrote an outcome, nor answered the question.
    const own = key !== undefined ? await renterRecord(transaction, key, now) : known ? NOTHING_YET : undefined
    return { view, key, own }
  })
  if (loaded.view === undefined) return { ok: false, failure: 'link_invalid' }
  const credential = loaded.key === undefined || loaded.own === undefined ? undefined : await credentialFor(loaded.key, loaded.own, locale, now)
  return { ok: true, view: { shopName: loaded.view.shopName, timeZone: loaded.view.timeZone, own: loaded.own, credential } }
}

// The public keys credentials are checked with: the signing key's, as a JSON Web Key Set lists it. None when the key
// cannot be reached just now.
export async function credentialKeys(): Promise<readonly PublicJwk[]> {
  try {
    return [await (await (await getServices()).trust.signer()).publicKey()]
  } catch {
    return []
  }
}
