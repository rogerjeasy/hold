import { hkdfSync } from 'node:crypto'
import { issueRenterToken, readRenterToken } from '@hold/auth'

// The two secrets an assistant holds (extensions.md section 8.5): the booking secret, returned once by create_booking,
// and the agent token for one rental, returned once by get_booking. Each is random and signed like a renter link, with
// a key of its own derived from the renter-link secret, so neither can pass for the other or for a renter link. Only
// fingerprints are stored. The prefix lets a person, and a leak scanner, tell what one is.

export type SecretKind = 'agent_token' | 'booking_secret'

const PREFIX: Readonly<Record<SecretKind, string>> = { agent_token: 'hat_', booking_secret: 'hbs_' }

const keyFor = (secret: Buffer, kind: SecretKind) => Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), `hold assistant ${kind}`, 32))

export function issueSecret(secret: Buffer, kind: SecretKind, random: () => Buffer): { readonly secret: string; readonly fingerprint: string } {
  const issued = issueRenterToken(keyFor(secret, kind), random)
  return { secret: `${PREFIX[kind]}${issued.token}`, fingerprint: issued.fingerprint }
}

// The fingerprint to look up, or nothing for a value that is not one this key signed.
export function readSecret(secret: Buffer, kind: SecretKind, value: string): string | undefined {
  if (!value.startsWith(PREFIX[kind])) return undefined
  return readRenterToken(keyFor(secret, kind), value.slice(PREFIX[kind].length))?.fingerprint
}
