import 'server-only'
import { randomBytes } from 'node:crypto'
import { issueRenterToken, readRenterToken, renterLinkExpiry, renterLinkKey, renterLinkPath } from '@hold/auth'
import { getServices } from './services'

async function key(): Promise<Buffer> {
  return renterLinkKey((await getServices()).renterLinkKey)
}

// A new link to a rental: the token for the address, and the fingerprint and end date to store.
export async function newRenterLink(rentalEndsAt: Date): Promise<{ readonly token: string; readonly fingerprint: string; readonly expiresAt: Date }> {
  const issued = issueRenterToken(await key(), () => randomBytes(32))
  return { ...issued, expiresAt: renterLinkExpiry(rentalEndsAt) }
}

export async function renterTokenFingerprint(token: string): Promise<string | undefined> {
  return readRenterToken(await key(), token)?.fingerprint
}

export async function renterUrl(token: string, language: string): Promise<string> {
  return `${(await getServices()).config.publicUrl}${renterLinkPath(token, language)}`
}
