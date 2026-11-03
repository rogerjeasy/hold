import { routing } from '../i18n/routing'

type Header = { readonly key: string; readonly value: string }
type HeaderRule = { source: string; headers: Header[] }

// Two years, as browsers' preload lists ask. Every Hold address is HTTPS; a browser that has seen one never tries HTTP.
const HSTS_SECONDS = 2 * 365 * 24 * 60 * 60

// The browser features Hold uses: the camera, for the handover and a renter's own return, and passkeys. Everything
// else that could reach a person's device is refused, for Hold's pages and anything they embed.
const PERMISSIONS = ['camera=(self)', 'publickey-credentials-get=(self)', 'microphone=()', 'geolocation=()', 'usb=()', 'serial=()', 'bluetooth=()', 'display-capture=()']

// Where scripts may come from: the app's own (Next writes inline scripts, and OpenCV compiles WebAssembly in a worker)
// and PayPal's SDK, which loads further scripts from PayPal. Reported, not enforced: a nonce-based policy that blocks is
// left for after judging, so nothing here can stop a page working. Only scripts are named, so nothing else is reported.
const SCRIPT_SOURCES = ["'self'", "'unsafe-inline'", "'unsafe-eval'", "'wasm-unsafe-eval'", 'blob:', 'https://www.sandbox.paypal.com', 'https://www.paypal.com', 'https://*.paypal.com', 'https://*.paypalobjects.com']

const EVERY_PAGE: Header[] = [
  { key: 'Strict-Transport-Security', value: `max-age=${String(HSTS_SECONDS)}; includeSubDomains` },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // No page of Hold's may be shown inside another site's frame, so none can be dressed up to trick a click.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: 'Content-Security-Policy-Report-Only', value: `script-src ${SCRIPT_SOURCES.join(' ')}` },
  { key: 'Permissions-Policy', value: PERMISSIONS.join(', ') },
]

// A renter's link and a staff invitation carry their token in the address, so a page there sends no referrer at all.
const PREFIXED = routing.locales.filter((locale) => locale !== routing.defaultLocale).join('|')
const TOKEN_PATHS = ['r', 'invite'].flatMap((segment) => [`/${segment}/:path*`, `/:locale(${PREFIXED})/${segment}/:path*`])

// Every response's security headers (architecture.md section 15). Next applies every rule that matches, in order, and
// a later rule's value for the same key wins.
export function securityHeaders(): HeaderRule[] {
  return [
    { source: '/:path*', headers: [...EVERY_PAGE] },
    ...TOKEN_PATHS.map((source) => ({ source, headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] })),
  ]
}
