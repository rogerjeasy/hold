import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { COOKIE_NAMES, cookieOptions } from './features/auth/cookie-settings'
import { routing } from './i18n/routing'
import { getServices } from './server/services'

const localize = createMiddleware(routing)

// The signed-in pages, in any language.
const SHOP_PAGE = new RegExp(`^(?:/(?:${routing.locales.join('|')}))?/shop(?:/|$)`)

// A signed-in page whose access token has lapsed gets a new one from the refresh token, then is asked for again.
// A refresh token that no longer works is removed, and the page sends the person to sign in.
async function refreshSession(request: NextRequest, refreshToken: string): Promise<NextResponse> {
  const { identity, config } = await getServices()
  const response = NextResponse.redirect(request.nextUrl)
  const refreshed = await identity.refresh(refreshToken)
  if (refreshed.ok) {
    response.cookies.set(COOKIE_NAMES.access, refreshed.value.accessToken, { ...cookieOptions(config), maxAge: refreshed.value.expiresInSeconds })
  } else {
    response.cookies.delete(COOKIE_NAMES.refresh)
    response.cookies.delete(COOKIE_NAMES.signedIn)
  }
  return response
}

export default async function proxy(request: NextRequest): Promise<NextResponse> {
  const refreshToken = request.cookies.get(COOKIE_NAMES.refresh)?.value
  if (SHOP_PAGE.test(request.nextUrl.pathname) && !request.cookies.has(COOKIE_NAMES.access) && refreshToken !== undefined) {
    return refreshSession(request, refreshToken)
  }
  return localize(request)
}

export const config = {
  // Every path except Next.js internals and files with an extension, such as images.
  matcher: '/((?!api|mcp|_next|_vercel|.*\\..*).*)',
}
