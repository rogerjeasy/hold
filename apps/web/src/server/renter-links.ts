import 'server-only'
import { randomBytes } from 'node:crypto'
import { addDays } from '@hold/domain'
import { issueRenterToken, readRenterToken, renterLinkKey } from '@hold/auth'
import { linkRoutes } from '@/lib/routes'
import { getServices } from './services'

// A link lasts as long as its rental might still need it: through the return, a claim and its reply.
const LINK_DAYS_AFTER_RENTAL = 60

async function key(): Promise<Buffer> {
  return renterLinkKey((await getServices()).cookieKey)
}

// A new link to a rental: the token for the address, and the fingerprint and end date to store.
export async function newRenterLink(rentalEndsAt: Date): Promise<{ readonly token: string; readonly fingerprint: string; readonly expiresAt: Date }> {
  const issued = issueRenterToken(await key(), () => randomBytes(32))
  return { ...issued, expiresAt: addDays(rentalEndsAt, LINK_DAYS_AFTER_RENTAL) }
}

export async function renterTokenFingerprint(token: string): Promise<string | undefined> {
  return readRenterToken(await key(), token)?.fingerprint
}

// The link's path in the renter's language: English at the bare path, as every page.
export function renterPath(token: string, language: string): string {
  return `${language === 'en' ? '' : `/${language}`}${linkRoutes.renter}/${token}`
}

export async function renterUrl(token: string, language: string): Promise<string> {
  return `${(await getServices()).config.publicUrl}${renterPath(token, language)}`
}
