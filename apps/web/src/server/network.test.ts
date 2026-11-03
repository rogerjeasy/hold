// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const forwarded = { value: '' }
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers(forwarded.value === '' ? {} : { 'x-forwarded-for': forwarded.value })) }))
const { callerNetwork } = await import('./network')

const from = async (address: string) => {
  forwarded.value = address
  return callerNetwork()
}

beforeEach(() => { forwarded.value = '' })

// Every per-network limit counts by what this returns, so a caller must not escape one by changing address within the
// network it was given: an IPv6 host is handed a whole /64.
describe('the caller’s network', () => {
  it('is one network for every IPv6 address in the same /64, however the address is written', async () => {
    const first = await from('2001:db8:abcd:12:1111:2222:3333:4444')
    expect(await from('2001:db8:abcd:12::9')).toBe(first)
    expect(await from('2001:0DB8:ABCD:0012:0:0:0:1')).toBe(first)
    expect(first).toBe('2001:db8:abcd:12::/64')
  })

  it('is another network for an address in another /64', async () => {
    expect(await from('2001:db8:abcd:13::1')).not.toBe(await from('2001:db8:abcd:12::1'))
  })

  it('is an IPv4 address as it is, including one written as IPv6', async () => {
    expect(await from('203.0.113.7')).toBe('203.0.113.7')
    expect(await from('::ffff:203.0.113.7')).toBe('203.0.113.7')
  })

  it('trusts only the last address the load balancer added', async () => {
    expect(await from('2001:db8:9::1, 2001:db8:abcd:12::5')).toBe('2001:db8:abcd:12::/64')
  })

  it('is unknown for a request from this machine or with no address', async () => {
    expect(await from('::1')).toBeUndefined()
    expect(await from('127.0.0.1')).toBeUndefined()
    expect(await from('')).toBeUndefined()
  })
})
