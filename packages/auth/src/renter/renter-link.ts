import { createHash, createHmac, hkdfSync, timingSafeEqual } from 'node:crypto'

// A renter has no account and acts through a link (architecture.md section 12.3). The token is random and signed, so a
// changed token is refused before the database is asked. Only its fingerprint is stored, so removing that row ends
// the link and the table reveals no link.

// What a link may be used for. Paying the fee or approving the hold happens in PayPal, approved by the renter there;
// accepting or contesting a claim also needs a one-time code.
export const RENTER_LINK_SCOPES = ['view', 'pay', 'confirm_condition', 'extend', 'accept', 'contest'] as const
export type RenterLinkScope = (typeof RENTER_LINK_SCOPES)[number]

const SIGNATURE_BYTES = 16
// The random part and the signature, joined with no separator: an address with a dot would read as a file name.
const RANDOM_LENGTH = 43
const SIGNATURE_LENGTH = 22

// A key for links alone, derived from the app's secret, so a link and a cookie never share a key.
export function renterLinkKey(secret: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), 'hold renter links', 32))
}

const sign = (key: Buffer, random: string) => createHmac('sha256', key).update(random).digest().subarray(0, SIGNATURE_BYTES)

const fingerprintOf = (token: string) => createHash('sha256').update(token).digest('hex')

export function issueRenterToken(key: Buffer, randomBytes: () => Buffer): { readonly token: string; readonly fingerprint: string } {
  const random = randomBytes().toString('base64url')
  const token = `${random}${sign(key, random).toString('base64url')}`
  return { token, fingerprint: fingerprintOf(token) }
}

export function readRenterToken(key: Buffer, token: string): { readonly fingerprint: string } | undefined {
  if (token.length !== RANDOM_LENGTH + SIGNATURE_LENGTH || !/^[A-Za-z0-9_-]+$/.test(token)) return undefined
  const random = token.slice(0, RANDOM_LENGTH)
  const signature = token.slice(RANDOM_LENGTH)
  const given = Buffer.from(signature, 'base64url')
  const expected = sign(key, random)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined
  return { fingerprint: fingerprintOf(token) }
}
