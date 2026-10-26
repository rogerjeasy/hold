import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { issueSecret, readSecret } from './secrets.ts'

const key = Buffer.alloc(32, 7)

describe('an agent token and a booking secret', () => {
  it('are signed, read back to the fingerprint that was stored, and never the same kind as each other', () => {
    const token = issueSecret(key, 'agent_token', () => randomBytes(32))
    expect(token.secret).toMatch(/^hat_[A-Za-z0-9_-]{65}$/)
    expect(readSecret(key, 'agent_token', token.secret)).toBe(token.fingerprint)
    expect(readSecret(key, 'booking_secret', token.secret)).toBeUndefined()
    const booking = issueSecret(key, 'booking_secret', () => randomBytes(32))
    expect(booking.secret).toMatch(/^hbs_/)
    expect(readSecret(key, 'booking_secret', booking.secret)).toBe(booking.fingerprint)
  })

  it('are refused when changed, unsigned or signed with another key, before anything is looked up', () => {
    const token = issueSecret(key, 'agent_token', () => randomBytes(32))
    const changed = `${token.secret.slice(0, -2)}${token.secret.endsWith('AA') ? 'BB' : 'AA'}`
    expect(readSecret(key, 'agent_token', changed)).toBeUndefined()
    expect(readSecret(Buffer.alloc(32, 8), 'agent_token', token.secret)).toBeUndefined()
    expect(readSecret(key, 'agent_token', 'hat_nonsense')).toBeUndefined()
  })
})
