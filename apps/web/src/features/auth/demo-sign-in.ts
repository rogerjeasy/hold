import 'server-only'
import type { DemoAccountKey, DemoAccounts, Tokens } from '@hold/auth'
import { LIMITS } from './sign-in-flow'
import type { FlowDependencies, FlowNotice, Requester } from './sign-in-flow'

// One tap signs a judge in to a demo account (architecture.md section 20.3): no address to type, no code to read.
// The server holds the account's password and signs in with it, so the session is a real one from the identity
// service and every check after it is the same as for anyone else. A money step still needs a passkey.

export type DemoDependencies = Pick<FlowDependencies, 'identity' | 'allow'> & {
  // Nothing where demo mode is off, which is every deployment but the demo.
  readonly demoAccounts: () => Promise<DemoAccounts | undefined>
}

export type DemoSignIn = { readonly ok: true; readonly tokens: Tokens } | { readonly ok: false; readonly notice: Extract<FlowNotice, 'busy' | 'unavailable'> }

export async function signInAsDemo(dependencies: DemoDependencies, key: DemoAccountKey, requester: Requester): Promise<DemoSignIn> {
  if (requester.network !== undefined && !(await dependencies.allow(LIMITS.requestsPerNetwork, requester.network))) return { ok: false, notice: 'busy' }
  const account = (await dependencies.demoAccounts())?.[key]
  if (account === undefined) return { ok: false, notice: 'unavailable' }
  const signedIn = await dependencies.identity.signInWithPassword(account.email, account.password)
  if (signedIn.ok) return { ok: true, tokens: signedIn.value }
  // Logged without the address or the password.
  console.warn(JSON.stringify({ event: 'identity_failure', step: 'demo_sign_in', kind: signedIn.error.kind, detail: signedIn.error.detail }))
  return { ok: false, notice: signedIn.error.kind === 'too_many_requests' ? 'busy' : 'unavailable' }
}
