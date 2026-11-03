import { expect, test } from './support/test'

// What the built server sends (architecture.md section 15): the public pages, sign-in, a renter's link and a signed-in
// page, which answers a visitor by sending them to sign in.
const PAGES = ['/', '/sign-in', '/r/not-a-real-token', '/shop'] as const

test('every page carries the security headers and does not say what it runs on', async ({ request }) => {
  for (const path of PAGES) {
    const response = await request.get(path, { maxRedirects: 0 })
    const headers = response.headers()
    expect(headers['strict-transport-security'], path).toMatch(/^max-age=\d+; includeSubDomains$/)
    expect(headers['x-content-type-options'], path).toBe('nosniff')
    expect(headers['x-frame-options'], path).toBe('DENY')
    expect(headers['content-security-policy'], path).toContain("frame-ancestors 'none'")
    expect(headers['content-security-policy-report-only'], path).toContain("script-src 'self'")
    expect(headers['permissions-policy'], path).toContain('camera=(self)')
    expect(headers['referrer-policy'], path).toBe(path.startsWith('/r/') ? 'no-referrer' : 'strict-origin-when-cross-origin')
    expect(headers['x-powered-by'], path).toBeUndefined()
  }
})
