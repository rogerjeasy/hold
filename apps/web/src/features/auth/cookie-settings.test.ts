import { describe, expect, it } from 'vitest'
import { cookieNames, cookieOptions } from './cookie-settings'

describe('the session cookies', () => {
  it('carry the __Host- prefix wherever they are Secure, so no other host or plain-HTTP page can set or shadow them', () => {
    for (const environment of ['production', 'test'] as const) {
      const names = Object.values(cookieNames({ environment }))
      expect(names.length).toBeGreaterThanOrEqual(7)
      for (const name of names) expect(name, environment).toMatch(/^__Host-hold_/)
      // What the prefix asks of a cookie, or the browser refuses it.
      expect(cookieOptions({ environment })).toMatchObject({ secure: true, path: '/' })
      expect(cookieOptions({ environment })).not.toHaveProperty('domain')
    }
  })

  it('keep their plain names on a developer’s machine, which serves plain HTTP that a browser refuses the prefix over', () => {
    for (const name of Object.values(cookieNames({ environment: 'development' }))) expect(name).toMatch(/^hold_/)
    expect(cookieOptions({ environment: 'development' })).toMatchObject({ secure: false })
  })
})
