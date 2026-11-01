import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'
import { SHOP_HEADER } from '@hold/mobile-api'
import { z } from 'zod'

// The phone's credential for one request: a Cognito access token sent as a bearer, and the shop it names in a header.
// It counts only inside a phone route (mobile-staff.ts), which runs its work through withStaffBearer. Anywhere else,
// such as a server function posted to a page, shopAccess reads the cookie session and nothing else, so a bearer
// reaches only the actions on the phone's list.

export type StaffBearer = { readonly accessToken: string; readonly shopId: string | undefined }

const requests = new AsyncLocalStorage<StaffBearer>()

// Cognito's tokens are base64url segments joined by dots, a few kilobytes at most.
const TOKEN_SHAPE = /^[A-Za-z0-9._~+/=-]{1,8192}$/
const shopIdSchema = z.uuid()

// The bearer a request carries, or nothing when it carries none, or one of the wrong shape. A shop header that is not
// an ID counts as no shop, which the shop check refuses.
export function bearerOf(headers: Headers): StaffBearer | undefined {
  const [scheme, accessToken, ...rest] = (headers.get('authorization') ?? '').split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || accessToken === undefined || rest.length > 0 || !TOKEN_SHAPE.test(accessToken)) return undefined
  const shop = shopIdSchema.safeParse(headers.get(SHOP_HEADER))
  return { accessToken, shopId: shop.success ? shop.data : undefined }
}

export function withStaffBearer<Output>(bearer: StaffBearer, work: () => Promise<Output>): Promise<Output> {
  return requests.run(bearer, work)
}

export function currentBearer(): StaffBearer | undefined {
  return requests.getStore()
}
