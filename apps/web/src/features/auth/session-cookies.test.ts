// @vitest-environment node
import { expect, it, vi } from 'vitest'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 9).toString('base64')

const deleted: unknown[] = []
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => undefined, set: () => undefined, delete: (cookie: unknown) => deleted.push(cookie) }),
  headers: () => Promise.resolve(new Headers()),
}))

const { clearAttempt, clearSession } = await import('./session-cookies')

// A browser ignores a Set-Cookie for a __Host- name that lacks Secure or Path=/, a removal included, so a session
// removed by name alone would stay signed in.
it('removes each cookie with the attributes its prefix needs, so the browser lets it go', async () => {
  await clearSession()
  await clearAttempt()
  expect(deleted.length).toBeGreaterThanOrEqual(7)
  for (const cookie of deleted) expect(cookie).toMatchObject({ name: expect.stringMatching(/^__Host-hold_/) as unknown, secure: true, path: '/' })
})
