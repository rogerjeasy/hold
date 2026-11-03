import 'server-only'
import { DEMO_ACCOUNT_KEYS, DEMO_SESSION_DOMAIN, newDemoPassword } from '@hold/auth'
import type { DemoAccountKey, DemoSessionAccounts, Tokens } from '@hold/auth'
import type { DemoSessionInput, OpenedDemoSession, PayPalMode, RateLimit } from '@hold/db'
import { DEMO_STARTS_PER_DAY, utcDay } from '@hold/domain'
import { z } from 'zod'
import { LIMITS } from './sign-in-flow'
import type { FlowDependencies, FlowNotice, Requester } from './sign-in-flow'

// One tap starts a demo of the judge's own (architecture.md section 20.3): two new accounts, Tomás the owner and Jonas
// at the counter, and a new Ribeira Bikes they alone work in. No address to type and no code to read. The passwords
// exist only in the session this returns, which the browser keeps sealed, so only that browser can sign in to them
// again, to switch between Tomás and Jonas. Every check after sign-in is the same as for anyone else, and a money step
// still needs a passkey.

// The day's cap spans every network, and counts in the UTC day, so the account's users and shops grow by at most this
// much a day however many networks ask.
export const DEMO_LIMITS = {
  startsPerNetwork: { name: 'demo_starts_per_network', max: 10, windowSeconds: 60 * 60 },
  startsPerDay: { name: 'demo_starts_per_day', max: DEMO_STARTS_PER_DAY, windowSeconds: 24 * 60 * 60 },
} as const satisfies Record<string, RateLimit>

const account = z.strictObject({ email: z.email(), password: z.string().min(24).max(256) })
export const demoSessionSchema = z.strictObject({ shopId: z.uuid(), owner: account, staff: account })
export type DemoSession = z.infer<typeof demoSessionSchema>

export type DemoSessionServices = {
  readonly accounts: DemoSessionAccounts
  readonly open: (input: DemoSessionInput) => Promise<OpenedDemoSession>
  // The demo's shared PayPal sandbox connection, or nothing while it has none, with the shared app's webhook when
  // PayPal could subscribe it.
  readonly paypal: () => Promise<{ readonly credentialReference: string; readonly mode: PayPalMode; readonly webhookId?: string } | undefined>
  // Whether the demo is still in its week. A retired one is never offered or signed in to again.
  readonly live: (shopId: string) => Promise<boolean>
}

export type DemoDependencies = Pick<FlowDependencies, 'identity' | 'allow'> & {
  // Nothing where demo mode is off, which is every deployment but the demo.
  readonly sessions: DemoSessionServices | undefined
  // A short random name for the session, shared by its shop's address and its accounts.
  readonly newCode: () => string
  readonly now: () => Date
}

// demo_cap: the day's demos are all started. demo_ended: the demo this browser kept was retired after its week.
export type DemoNotice = Extract<FlowNotice, 'busy' | 'unavailable'> | 'demo_cap' | 'demo_ended'
export type DemoSignIn = { readonly ok: true; readonly tokens: Tokens } | { readonly ok: false; readonly notice: DemoNotice }
export type DemoStart = { readonly ok: true; readonly tokens: Tokens; readonly session: DemoSession } | { readonly ok: false; readonly notice: DemoNotice }

const NAMES: Record<DemoAccountKey, string> = { owner: 'tomas', staff: 'jonas' }
const GROUPS = { owner: 'owner', staff: 'staff' } as const

// Logged without an address or a password.
function warn(step: string, detail: string): void {
  console.warn(JSON.stringify({ event: 'demo_failure', step, detail }))
}

async function signIn(dependencies: DemoDependencies, session: DemoSession, key: DemoAccountKey): Promise<DemoSignIn> {
  const signedIn = await dependencies.identity.signInWithPassword(session[key].email, session[key].password)
  if (signedIn.ok) return { ok: true, tokens: signedIn.value }
  warn('sign_in', signedIn.error.kind)
  return { ok: false, notice: signedIn.error.kind === 'too_many_requests' ? 'busy' : 'unavailable' }
}

export async function startDemo(dependencies: DemoDependencies, key: DemoAccountKey, requester: Requester): Promise<DemoStart> {
  const { sessions } = dependencies
  if (sessions === undefined) return { ok: false, notice: 'unavailable' }
  // A network is unknown only for a request from this machine (callerNetwork): the deployed app always sits behind App
  // Runner's load balancer, which names it. The day's cap below still counts every start.
  if (requester.network !== undefined && !(await dependencies.allow(DEMO_LIMITS.startsPerNetwork, requester.network))) return { ok: false, notice: 'busy' }
  if (!(await dependencies.allow(DEMO_LIMITS.startsPerDay, utcDay(dependencies.now())))) return { ok: false, notice: 'demo_cap' }
  const code = dependencies.newCode()
  const people = Object.fromEntries(DEMO_ACCOUNT_KEYS.map((each) => [each, { email: `${NAMES[each]}.${code}@${DEMO_SESSION_DOMAIN}`, password: newDemoPassword() }])) as Record<DemoAccountKey, DemoSession['owner']>
  let opened: OpenedDemoSession
  try {
    const owner = await sessions.accounts.create({ ...people.owner, group: GROUPS.owner })
    const staff = await sessions.accounts.create({ ...people.staff, group: GROUPS.staff })
    opened = await sessions.open({
      owner: { subject: owner, email: people.owner.email },
      staff: { subject: staff, email: people.staff.email },
      slug: `ribeira-bikes-${code}`,
      paypal: await sessions.paypal(),
      now: dependencies.now(),
    })
  } catch (error) {
    warn('open', error instanceof Error ? error.name : 'unknown')
    return { ok: false, notice: 'unavailable' }
  }
  const session = { shopId: opened.shopId, owner: people.owner, staff: people.staff }
  const signedIn = await signIn(dependencies, session, key)
  return signedIn.ok ? { ...signedIn, session } : signedIn
}

// Signs the browser that started the demo in again, as either of its two people. Limited like any other sign-in. A
// demo retired after its week is refused before its accounts, which are gone, are asked.
export async function continueDemo(dependencies: DemoDependencies, session: DemoSession, key: DemoAccountKey, requester: Requester): Promise<DemoSignIn> {
  if (dependencies.sessions === undefined) return { ok: false, notice: 'unavailable' }
  if (requester.network !== undefined && !(await dependencies.allow(LIMITS.requestsPerNetwork, requester.network))) return { ok: false, notice: 'busy' }
  if (!(await dependencies.sessions.live(session.shopId))) return { ok: false, notice: 'demo_ended' }
  return signIn(dependencies, session, key)
}
