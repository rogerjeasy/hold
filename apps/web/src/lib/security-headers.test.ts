// @vitest-environment node
import { describe, expect, it } from 'vitest'
import nextConfig from '../../next.config'
import { securityHeaders } from './security-headers'

type Rule = { readonly source: string; readonly headers: readonly { readonly key: string; readonly value: string }[] }
const rules = securityHeaders() as readonly Rule[]
// The value a path ends up with: Next applies every matching rule in order, and a later rule's value for the same key
// wins, so a token page's no-referrer overrides the default.
const valueFor = (path: string, key: string): string | undefined => {
  let value: string | undefined
  for (const rule of rules) {
    const pattern = new RegExp(`^${rule.source.replace(/\(([^)]+)\)/g, '(?:$1)').replace(/:path\*/g, '.*').replace(/:locale/g, '')}$`)
    if (!pattern.test(path)) continue
    value = rule.headers.find((header) => header.key.toLowerCase() === key.toLowerCase())?.value ?? value
  }
  return value
}

describe('the headers every response carries (architecture.md section 15)', () => {
  it('forces HTTPS, refuses sniffing, framing and the browser features the app never uses', () => {
    for (const path of ['/', '/sign-in', '/shop', '/fr/shop/rentals']) {
      expect(valueFor(path, 'Strict-Transport-Security')).toMatch(/^max-age=\d{8,}; includeSubDomains$/)
      expect(valueFor(path, 'X-Content-Type-Options')).toBe('nosniff')
      expect(valueFor(path, 'X-Frame-Options')).toBe('DENY')
      expect(valueFor(path, 'Content-Security-Policy')).toContain("frame-ancestors 'none'")
      expect(valueFor(path, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin')
      const permissions = valueFor(path, 'Permissions-Policy') ?? ''
      // The handover and the renter's own return take photographs; passkeys sign in.
      expect(permissions).toContain('camera=(self)')
      expect(permissions).toContain('publickey-credentials-get=(self)')
      for (const denied of ['microphone=()', 'geolocation=()', 'usb=()']) expect(permissions).toContain(denied)
    }
  })

  it('sends no referrer from a page whose address carries a renter\'s or an invitation\'s token', () => {
    for (const path of ['/r/abc', '/r/abc/claim', '/de/r/abc/negotiation', '/invite/xyz', '/es/invite/xyz']) expect(valueFor(path, 'Referrer-Policy')).toBe('no-referrer')
    expect(valueFor('/rentals', 'Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  })

  it('reports, without blocking, any script from outside the app and PayPal', () => {
    const policy = valueFor('/r/abc', 'Content-Security-Policy-Report-Only') ?? ''
    expect(policy).toMatch(/^script-src 'self' /)
    expect(policy).toContain('https://www.sandbox.paypal.com')
    expect(policy).not.toContain('*;')
  })

  it('is what the app serves, and the app does not say what it runs on', async () => {
    expect(nextConfig.poweredByHeader).toBe(false)
    expect(await nextConfig.headers?.()).toEqual(securityHeaders())
  })
})
