import { describe, expect, it } from 'vitest'
import { issueRenterToken, readRenterToken, RENTER_LINK_SCOPES, renterLinkKey } from './renter-link.ts'

const key = renterLinkKey(Buffer.alloc(32, 3))
const bytes = (fill: number) => () => Buffer.alloc(32, fill)

describe('a renter link token', () => {
  it('reads back to the fingerprint stored for it', () => {
    const issued = issueRenterToken(key, bytes(1))
    expect(readRenterToken(key, issued.token)).toEqual({ fingerprint: issued.fingerprint })
    expect(issued.fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is different for every link, and safe in an address with no dot, which would read as a file name', () => {
    const first = issueRenterToken(key, bytes(1))
    const second = issueRenterToken(key, bytes(2))
    expect(first.token).not.toBe(second.token)
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{65}$/)
  })

  it('is refused when changed by one character, or signed with another key', () => {
    const { token } = issueRenterToken(key, bytes(1))
    const changed = `${token.slice(0, 5)}${token[5] === 'A' ? 'B' : 'A'}${token.slice(6)}`
    expect(readRenterToken(key, changed)).toBeUndefined()
    expect(readRenterToken(renterLinkKey(Buffer.alloc(32, 4)), token)).toBeUndefined()
    expect(readRenterToken(key, 'not-a-token')).toBeUndefined()
    expect(readRenterToken(key, '')).toBeUndefined()
  })

  it('has a fixed list of scopes, none of which moves money on its own', () => {
    expect(RENTER_LINK_SCOPES).toEqual(['view', 'pay', 'confirm_condition', 'extend', 'accept', 'contest'])
  })
})
