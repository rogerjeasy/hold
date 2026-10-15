import 'server-only'
import { headers } from 'next/headers'

const LOOPBACK = new Set(['::1', '127.0.0.1', '::ffff:127.0.0.1'])

// The caller's network address. The load balancer in front of the app adds it last to x-forwarded-for, so the last
// entry is the one to trust: anything before it the caller could have written. A loopback address means a request
// from the developer's own machine, which has no load balancer.
export async function callerNetwork(): Promise<string | undefined> {
  const forwarded = (await headers()).get('x-forwarded-for')?.split(',').at(-1)?.trim()
  return forwarded === undefined || forwarded === '' || LOOPBACK.has(forwarded) ? undefined : forwarded
}
