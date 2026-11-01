import 'server-only'
import { readLocale } from '@/features/auth/locale-input'
import type { Locale } from '@/i18n/routing'

// The one wrapper for the phone app's renter routes (architecture.md section 13.8). The renter's link token travels as
// a bearer instead of in the address, and the language as Accept-Language. The wrapper only reads them: the checks of
// AGENTS.md section 7 are renterAccess's and renterAction's, which every renter route calls, so a renter on the phone
// passes exactly the checks a renter on the web passes. A test lists every renter route and fails on any built
// without this wrapper.

export type RenterRequest = { readonly request: Request; readonly token: string; readonly locale: Locale }

type Handler<Params> = (request: Request, context: { params: Promise<Params> }) => Promise<Response>

const ROUTES = new WeakSet<object>()

export function isMobileRenterRoute(value: unknown): boolean {
  return typeof value === 'function' && ROUTES.has(value)
}

// A missing or malformed header reads as an empty token, which renterAccess refuses like any other Hold did not sign.
export function bearerToken(request: Request): string {
  const match = /^Bearer ([A-Za-z0-9._~+/=-]{1,200})$/.exec(request.headers.get('authorization') ?? '')
  return match?.[1] ?? ''
}

const languageOf = (request: Request): Locale => readLocale(request.headers.get('accept-language')?.split(/[,;-]/)[0]?.trim().toLowerCase())

export function mobileRenterRoute<Params>(handle: (caller: RenterRequest, params: Params) => Promise<Response>): Handler<Params> {
  const route: Handler<Params> = async (request, context) => handle({ request, token: bearerToken(request), locale: languageOf(request) }, await context.params)
  ROUTES.add(route)
  return route
}
