import 'server-only'
import { readAccessToken } from '@/features/auth/session-cookies'
import { getServices } from './services'
import type { ShopContext } from './shop-access'

// What a page that changes the shop needs to offer the passkey confirmation: whether it is still needed, whether the
// person has a passkey to confirm with, and their address.
export async function passkeyGate(context: ShopContext) {
  const { identity } = await getServices()
  const passkeys = await identity.listPasskeys((await readAccessToken()) ?? '')
  return { needed: context.passkeyNeeded, hasPasskey: passkeys.ok && passkeys.value.length > 0, email: context.person.email }
}
