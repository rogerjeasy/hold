import 'server-only'
import { headers } from 'next/headers'

const LOOPBACK = new Set(['::1', '127.0.0.1', '::ffff:127.0.0.1'])
const MAPPED_IPV4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/

// The network an address belongs to, as every per-network limit counts it. An IPv6 host is usually handed a whole /64,
// so it is its /64 prefix, written one way however the address was; an IPv4 address is itself, also when written as
// IPv6. Anything that does not read as an address is kept as it came, so it still counts as one network.
function networkOf(address: string): string {
  const lower = address.toLowerCase()
  const mapped = MAPPED_IPV4.exec(lower)?.[1]
  if (mapped !== undefined) return mapped
  if (!lower.includes(':')) return lower
  const [head = '', tail] = lower.split('::')
  const front = head === '' ? [] : head.split(':')
  const back = tail === undefined || tail === '' ? [] : tail.split(':')
  const groups = tail === undefined ? front : [...front, ...Array<string>(Math.max(0, 8 - front.length - back.length)).fill('0'), ...back]
  const prefix = groups.slice(0, 4).map((group) => Number.parseInt(group, 16))
  if (groups.length !== 8 || prefix.some((group) => !Number.isInteger(group) || group < 0 || group > 0xffff)) return lower
  return `${prefix.map((group) => group.toString(16)).join(':')}::/64`
}

// The caller's network. The load balancer in front of the app adds the address last to x-forwarded-for, so the last
// entry is the one to trust: anything before it the caller could have written. A loopback address means a request
// from the developer's own machine, which has no load balancer.
export async function callerNetwork(): Promise<string | undefined> {
  const forwarded = (await headers()).get('x-forwarded-for')?.split(',').at(-1)?.trim()
  return forwarded === undefined || forwarded === '' || LOOPBACK.has(forwarded) ? undefined : networkOf(forwarded)
}
