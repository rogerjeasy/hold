import 'server-only'
import { isDemoSessionAddress } from '@hold/auth'
import { readAccessToken } from '@/features/auth/session-cookies'
import { getServices } from './services'
import type { ShopContext } from './shop-access'

// What a page that changes the shop needs to offer the passkey confirmation: whether it is still needed, whether the
// person has a passkey to confirm with, their address, and whether the account is a demo session's, whose passkey stays
// in the browser that made it, so the gate names the ways out.
export async function passkeyGate(context: ShopContext) {
  const { identity } = await getServices()
  const passkeys = await identity.listPasskeys((await readAccessToken()) ?? '')
  return { needed: context.passkeyNeeded, hasPasskey: passkeys.ok && passkeys.value.length > 0, email: context.person.email, demo: isDemoSessionAddress(context.person.email) }
}
