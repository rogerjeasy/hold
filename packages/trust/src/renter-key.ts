import { createHmac } from 'node:crypto'

// The renter key (extensions.md section 7.4): a keyed hash of the PayPal payer ID, made with a secret only Hold has.
// Trust records and credentials carry this, never the payer ID, and nobody without the secret can tell whose it is.

const SHORTEST_SECRET = 32

export type RenterKey = (payerId: string) => string

export function renterKeyFor(secret: Buffer): RenterKey {
  if (secret.length < SHORTEST_SECRET) throw new RangeError(`The renter key secret must be at least ${String(SHORTEST_SECRET)} bytes.`)
  return (payerId) => createHmac('sha256', secret).update(payerId, 'utf8').digest('base64url')
}
