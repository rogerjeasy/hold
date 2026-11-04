import { followOwnBooking as bindOwnBooking } from '@hold/db'
import type { FollowResult } from '@hold/db'
import type { McpPorts } from './ports.ts'
import { inShopOf } from './ports.ts'
import { issueSecret } from './secrets.ts'

export type OwnBookingSecret = { readonly ok: true; readonly rentalId: string; readonly bookingSecret: string } | Extract<FollowResult, { readonly ok: false }>

// A booking secret for the demo visitor's own latest booking (extensions.md section 8.10), made exactly as
// create_booking makes one, so the assistant follows it only through get_booking and the gateway. The caller has
// proved the shop is the visitor's; the secret is returned once and only its fingerprint is kept.
export async function followOwnBooking(ports: McpPorts, shopId: string, clientLabel: string): Promise<OwnBookingSecret> {
  const secret = issueSecret(ports.secret, 'booking_secret', ports.random)
  const bound = await inShopOf(ports, shopId, (transaction) => bindOwnBooking(transaction, { shopId, bookingSecretFingerprint: secret.fingerprint, clientLabel }, ports.now()))
  return bound.ok ? { ok: true, rentalId: bound.rentalId, bookingSecret: secret.secret } : bound
}
